use anchor_lang::prelude::*;

use crate::constants::*;
use crate::economics::roll_tier;
use crate::error::ErrorCode;
use crate::events::*;
use crate::external::{core, switchboard};
use crate::ops;
use crate::state::*;

/// Pays the mint price and commits to a Switchboard randomness account. The fee is taken here,
/// before the outcome exists, and there is no refund path, so a bad roll cannot be aborted.
#[event_cpi]
#[derive(Accounts)]
pub struct MintCommit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [POOL_SEED], bump = config.pool_bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, seeds = [VAULT_SEED], bump = config.vault_bump)]
    pub vault: Account<'info, Vault>,
    /// CHECK: address-checked.
    #[account(mut, address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    #[account(mut, address = config.checkpoints)]
    pub checkpoints: AccountLoader<'info, Checkpoints>,
    /// CHECK: Switchboard randomness account; owner, discriminator and freshness checked.
    pub randomness: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + PendingMint::INIT_SPACE,
        seeds = [PENDING_SEED, &pool.minted_count.to_le_bytes()],
        bump,
    )]
    pub pending: Account<'info, PendingMint>,
    pub system_program: Program<'info, System>,
}

pub fn handle_mint_commit(mut ctx: Context<MintCommit>) -> Result<()> {
    let a = &mut ctx.accounts;
    let p = &a.config.params;
    require!(!a.config.paused_mint, ErrorCode::MintPaused);
    require!(
        a.pool.live_subs as u64 + (a.pool.pending_mints as u64) < p.max_live_subs as u64,
        ErrorCode::SupplyCapReached
    );
    let clock = Clock::get()?;
    let seed_slot = switchboard::check_commit(&a.randomness, clock.slot)?;

    let (to_pool, to_treasury) = {
        let mut cps = a.checkpoints.load_mut()?;
        ops::charge_fee(
            &a.payer,
            &a.vault.to_account_info(),
            &a.treasury,
            &mut a.pool,
            &mut *cps,
            p,
            p.mint_price,
            clock.unix_timestamp,
        )?
    };
    ops::transfer(&a.payer, &a.pending.to_account_info(), MINT_RENT_DEPOSIT)?;

    let mint_index = a.pool.minted_count;
    a.pending.set_inner(PendingMint {
        payer: a.payer.key(),
        mint_index,
        randomness: a.randomness.key(),
        seed_slot,
        committed_at: clock.unix_timestamp,
        bump: ctx.bumps.pending,
    });
    a.pool.minted_count += 1;
    a.pool.pending_mints += 1;
    let event_0 = FeePaid { payer: a.payer.key(), kind: FeeKind::Mint, amount: p.mint_price, to_pool, to_treasury };
    let event_1 = MintCommitted { payer: a.payer.key(), mint_index, randomness: a.randomness.key() };
    emit_cpi!(event_0);
    emit_cpi!(event_1);
    Ok(())
}

/// Permissionless. Rolls the tier from the revealed randomness (or, after `REVEAL_TIMEOUT` with no
/// valid reveal, falls back to the lowest tier), creates the Core asset for the original payer,
/// reimburses the caller's rent from the prepaid deposit and refunds the rest to the payer.
#[event_cpi]
#[derive(Accounts)]
pub struct MintReveal<'info> {
    #[account(mut)]
    pub cranker: Signer<'info>,
    /// CHECK: the minter; receives the asset and the leftover deposit.
    #[account(mut, address = pending.payer)]
    pub payer: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [POOL_SEED], bump = config.pool_bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        close = payer,
        seeds = [PENDING_SEED, &pending.mint_index.to_le_bytes()],
        bump = pending.bump,
    )]
    pub pending: Account<'info, PendingMint>,
    /// CHECK: address-checked against the commitment; parsed leniently (see switchboard.rs).
    #[account(address = pending.randomness)]
    pub randomness: UncheckedAccount<'info>,
    /// CHECK: created by Core at this PDA.
    #[account(mut, seeds = [ASSET_SEED, &pending.mint_index.to_le_bytes()], bump)]
    pub asset: UncheckedAccount<'info>,
    #[account(
        init,
        payer = cranker,
        space = 8 + Sub::INIT_SPACE,
        seeds = [SUB_SEED, asset.key().as_ref()],
        bump,
    )]
    pub sub: Box<Account<'info, Sub>>,
    /// CHECK: address-checked.
    #[account(mut, address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: signer-only PDA.
    #[account(seeds = [AUTHORITY_SEED], bump = config.authority_bump)]
    pub authority: UncheckedAccount<'info>,
    /// CHECK: address-checked program.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_mint_reveal(mut ctx: Context<MintReveal>) -> Result<()> {
    let a = &mut ctx.accounts;
    let p = &a.config.params;
    let now = ops::now()?;
    let (tier, fallback) = match switchboard::revealed_value(&a.randomness, a.pending.seed_slot) {
        Some(value) => (roll_tier(&value, &p.tier_odds_bps), false),
        None => {
            require!(
                now >= a.pending.committed_at.saturating_add(REVEAL_TIMEOUT),
                ErrorCode::RandomnessNotRevealed
            );
            (0, true)
        }
    };

    let index = a.pending.mint_index;
    let name = format!("{NAME_PREFIX}{}", index + 1);
    let uri = format!("{}{}", a.config.uri_base, a.asset.key());
    let before = a.cranker.lamports();
    core::create_asset(
        &a.mpl_core,
        &a.asset,
        &a.collection,
        &a.authority,
        &a.cranker,
        &a.payer,
        &a.system_program,
        &name,
        &uri,
        &[
            &[ASSET_SEED, &index.to_le_bytes(), &[ctx.bumps.asset]],
            &[AUTHORITY_SEED, &[a.config.authority_bump]],
        ],
    )?;
    // Reimburse the caller for the asset and Sub rent out of the minter's deposit.
    let spent = before.saturating_sub(a.cranker.lamports()) + a.sub.to_account_info().lamports();
    let pending_info = a.pending.to_account_info();
    let left = pending_info.lamports().checked_sub(spent).ok_or(ErrorCode::RentDepositTooSmall)?;
    **pending_info.try_borrow_mut_lamports()? = left;
    let cranker_balance = a.cranker.lamports() + spent;
    **a.cranker.try_borrow_mut_lamports()? = cranker_balance;

    let depth = p.tier_depth[tier as usize];
    a.sub.set_inner(Sub {
        asset: a.asset.key(),
        mint_index: index,
        tier,
        level: 0,
        base_depth: depth,
        depth,
        barnacles: 0,
        state: SubState::Idle,
        harbor: Pubkey::default(),
        away_until: 0,
        away_hours: 0,
        randomness: Pubkey::default(),
        seed_slot: 0,
        committed_at: 0,
        bump: ctx.bumps.sub,
    });
    a.pool.live_subs += 1;
    a.pool.pending_mints -= 1;
    let event_0 = SubMinted { owner: a.payer.key(), asset: a.asset.key(), mint_index: index, tier, depth, fallback };
    emit_cpi!(event_0);
    Ok(())
}
