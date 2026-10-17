use anchor_lang::prelude::*;

use crate::constants::*;
use crate::economics::{expedition_find, Find};
use crate::error::ErrorCode;
use crate::events::*;
use crate::external::orao;
use crate::ops;
use crate::state::*;

/// Sends a docked sub away for 1–6 hours. It stays frozen in its slot but earns nothing until it
/// returns. One expedition at a time per harbor, and the next may start 24 h after a return, so a
/// harbor never has two boosts at once.
#[event_cpi]
#[derive(Accounts)]
pub struct ExpeditionStart<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [POOL_SEED], bump = config.pool_bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, address = config.checkpoints)]
    pub checkpoints: AccountLoader<'info, Checkpoints>,
    #[account(mut, seeds = [HARBOR_SEED, owner.key().as_ref()], bump = harbor.bump)]
    pub harbor: Box<Account<'info, Harbor>>,
    #[account(mut, seeds = [SUB_SEED, sub.asset.as_ref()], bump = sub.bump)]
    pub sub: Box<Account<'info, Sub>>,
}

pub fn handle_expedition_start(mut ctx: Context<ExpeditionStart>, hours: u8) -> Result<()> {
    let a = &mut ctx.accounts;
    require!(!a.config.paused_upgrades, ErrorCode::UpgradesPaused);
    require!(
        a.sub.state == SubState::Docked && a.sub.harbor == a.harbor.key(),
        ErrorCode::WrongSubState
    );
    require!(a.harbor.expedition_sub == Pubkey::default(), ErrorCode::ExpeditionActive);
    let now = ops::now()?;
    require!(
        a.harbor.last_expedition_return == 0
            || now >= a.harbor.last_expedition_return + EXPEDITION_COOLDOWN,
        ErrorCode::ExpeditionCooldown
    );
    require!((1..=MAX_EXPEDITION_HOURS).contains(&hours), ErrorCode::InvalidExpeditionHours);

    let before = a.harbor.rewards.depth;
    {
        let mut cps = a.checkpoints.load_mut()?;
        if a.harbor.boost_sub == a.sub.key() {
            a.pool.rewards.cancel_boost(&mut a.harbor.rewards, now, &mut *cps)?;
            a.harbor.boost_sub = Pubkey::default();
        }
        a.pool.rewards.remove_depth(&mut a.harbor.rewards, a.sub.depth, now, &mut *cps)?;
    }
    ops::track_active(&mut a.pool, before, a.harbor.rewards.depth);
    let returns_at = now + hours as i64 * 3_600;
    a.sub.state = SubState::Away;
    a.sub.away_until = returns_at;
    a.sub.away_hours = hours;
    a.harbor.expedition_sub = a.sub.key();
    let event_0 = ExpeditionStarted { owner: a.owner.key(), asset: a.sub.asset, hours, returns_at };
    emit_cpi!(event_0);
    Ok(())
}

/// Requests ORAO randomness for the return roll once the sub is due back. Never paused.
#[derive(Accounts)]
pub struct ExpeditionReturnCommit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [HARBOR_SEED, owner.key().as_ref()], bump = harbor.bump)]
    pub harbor: Box<Account<'info, Harbor>>,
    #[account(mut, seeds = [SUB_SEED, sub.asset.as_ref()], bump = sub.bump)]
    pub sub: Box<Account<'info, Sub>>,
    /// CHECK: ORAO network state (seed-checked under the ORAO program).
    #[account(mut, seeds = [orao::NETWORK_STATE_SEED], bump, seeds::program = ORAO_VRF_ID)]
    pub vrf_network_state: UncheckedAccount<'info>,
    /// CHECK: ORAO treasury; ORAO checks it against its network state.
    #[account(mut)]
    pub vrf_treasury: UncheckedAccount<'info>,
    /// CHECK: ORAO request account, created by ORAO at PDA(["orao-vrf-randomness-request", seed]).
    #[account(mut)]
    pub vrf_request: UncheckedAccount<'info>,
    /// CHECK: address-checked program.
    #[account(address = ORAO_VRF_ID)]
    pub vrf_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_expedition_return_commit(mut ctx: Context<ExpeditionReturnCommit>, nonce: [u8; 32]) -> Result<()> {
    let a = &mut ctx.accounts;
    require!(
        a.sub.state == SubState::Away && a.sub.harbor == a.harbor.key(),
        ErrorCode::WrongSubState
    );
    let clock = Clock::get()?;
    require!(clock.unix_timestamp >= a.sub.away_until, ErrorCode::StillAway);
    let vrf_seed = orao::expedition_seed(&a.sub.key(), a.sub.away_until, &nonce);
    orao::request(
        &a.vrf_program,
        &a.owner,
        &a.vrf_network_state,
        &a.vrf_treasury,
        &a.vrf_request,
        &a.system_program,
        vrf_seed,
    )?;
    a.sub.vrf_seed = vrf_seed;
    a.sub.randomness = a.vrf_request.key();
    a.sub.committed_at = clock.unix_timestamp;
    a.sub.state = SubState::Returning;
    Ok(())
}

/// Permissionless. Re-docks the sub and applies its find. With no valid reveal after
/// `REVEAL_TIMEOUT`, the find is "nothing" (the lowest outcome), so withholding a reveal never helps.
#[event_cpi]
#[derive(Accounts)]
pub struct ExpeditionReturnReveal<'info> {
    pub cranker: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [POOL_SEED], bump = config.pool_bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, address = config.checkpoints)]
    pub checkpoints: AccountLoader<'info, Checkpoints>,
    #[account(mut, address = sub.harbor)]
    pub harbor: Box<Account<'info, Harbor>>,
    #[account(mut, seeds = [SUB_SEED, sub.asset.as_ref()], bump = sub.bump)]
    pub sub: Box<Account<'info, Sub>>,
    /// CHECK: address-checked against the commitment; parsed leniently.
    #[account(address = sub.randomness)]
    pub vrf_request: UncheckedAccount<'info>,
}

pub fn handle_expedition_return_reveal(mut ctx: Context<ExpeditionReturnReveal>) -> Result<()> {
    let a = &mut ctx.accounts;
    require!(a.sub.state == SubState::Returning, ErrorCode::WrongSubState);
    let now = ops::now()?;
    let (find, fallback) = match orao::fulfilled_value(&a.vrf_request, &a.sub.vrf_seed) {
        Some(value) => (expedition_find(&value, &a.config.params, a.sub.depth, a.sub.away_hours)?, false),
        None => {
            require!(
                now >= a.sub.committed_at.saturating_add(REVEAL_TIMEOUT),
                ErrorCode::RandomnessNotRevealed
            );
            (Find::Nothing, true)
        }
    };

    let before = a.harbor.rewards.depth;
    let mut cps = a.checkpoints.load_mut()?;
    a.pool.rewards.add_depth(&mut a.harbor.rewards, a.sub.depth, now, &mut *cps)?;
    // add_depth settled the harbor, which clears a boost that already expired.
    if a.harbor.rewards.boost_extra == 0 {
        a.harbor.boost_sub = Pubkey::default();
    }
    let outcome = match find {
        Find::Boost { extra, duration } if a.harbor.rewards.boost_extra == 0 => {
            let duration = duration.min(MAX_BOOST_HOURS * 3_600);
            a.pool.rewards.grant_boost(&mut a.harbor.rewards, extra, duration, now, &mut *cps)?;
            a.harbor.boost_sub = a.sub.key();
            ExpeditionOutcome::Boost { extra, end_hour: a.harbor.rewards.boost_end_hour }
        }
        // Unreachable with the 24 h cooldown and ≤ 12 h boosts; kept so a reveal can never fail.
        Find::Boost { .. } => ExpeditionOutcome::Nothing,
        Find::Barnacle { bit } => {
            a.sub.barnacles |= 1 << bit;
            ExpeditionOutcome::Barnacle { bit }
        }
        Find::Nothing => ExpeditionOutcome::Nothing,
    };
    drop(cps);
    ops::track_active(&mut a.pool, before, a.harbor.rewards.depth);
    a.sub.state = SubState::Docked;
    a.sub.randomness = Pubkey::default();
    a.harbor.expedition_sub = Pubkey::default();
    a.harbor.last_expedition_return = now;
    let event_0 = ExpeditionReturned { owner: a.harbor.owner, asset: a.sub.asset, outcome, fallback };
    emit_cpi!(event_0);
    Ok(())
}
