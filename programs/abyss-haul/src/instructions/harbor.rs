use anchor_lang::prelude::*;

use crate::constants::*;
use crate::economics::slot_cost;
use crate::error::ErrorCode;
use crate::events::*;
use crate::external::core;
use crate::ops;
use crate::rewards::HarborRewards;
use crate::state::*;

#[derive(Accounts)]
pub struct OpenHarbor<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        init,
        payer = owner,
        space = 8 + Harbor::INIT_SPACE,
        seeds = [HARBOR_SEED, owner.key().as_ref()],
        bump,
    )]
    pub harbor: Box<Account<'info, Harbor>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_open_harbor(ctx: Context<OpenHarbor>) -> Result<()> {
    ctx.accounts.harbor.set_inner(Harbor {
        owner: ctx.accounts.owner.key(),
        slots: ctx.accounts.config.params.harbor_start_slots,
        docked: 0,
        rewards: HarborRewards::default(),
        boost_sub: Pubkey::default(),
        expedition_sub: Pubkey::default(),
        last_expedition_return: 0,
        total_claimed: 0,
        bump: ctx.bumps.harbor,
    });
    Ok(())
}

/// Accounts for docking and undocking one sub.
#[event_cpi]
#[derive(Accounts)]
pub struct DockAction<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [POOL_SEED], bump = config.pool_bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, address = config.checkpoints)]
    pub checkpoints: AccountLoader<'info, Checkpoints>,
    #[account(mut, seeds = [HARBOR_SEED, owner.key().as_ref()], bump = harbor.bump)]
    pub harbor: Box<Account<'info, Harbor>>,
    #[account(mut, seeds = [SUB_SEED, asset.key().as_ref()], bump = sub.bump)]
    pub sub: Box<Account<'info, Sub>>,
    /// CHECK: the Core asset for `sub` (seed-bound); ownership verified in the handler.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: address-checked.
    #[account(mut, address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: signer-only PDA holding each sub's PermanentFreezeDelegate.
    #[account(seeds = [AUTHORITY_SEED], bump = config.authority_bump)]
    pub authority: UncheckedAccount<'info>,
    /// CHECK: address-checked program.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_dock(mut ctx: Context<DockAction>) -> Result<()> {
    let a = &mut ctx.accounts;
    require!(!a.config.paused_upgrades, ErrorCode::UpgradesPaused);
    require!(a.sub.state == SubState::Idle, ErrorCode::WrongSubState);
    require_keys_eq!(
        core::asset_owner(&a.asset, &a.config.collection)?,
        a.owner.key(),
        ErrorCode::NotOwner
    );
    require!(a.harbor.docked < a.harbor.slots, ErrorCode::HarborFull);

    core::set_frozen(
        &a.mpl_core,
        &a.asset,
        &a.collection,
        &a.authority,
        &a.owner,
        &a.system_program,
        true,
        &[&[AUTHORITY_SEED, &[a.config.authority_bump]]],
    )?;

    let before = a.harbor.rewards.depth;
    {
        let mut cps = a.checkpoints.load_mut()?;
        a.pool.rewards.add_depth(&mut a.harbor.rewards, a.sub.depth, ops::now()?, &mut *cps)?;
    }
    ops::track_active(&mut a.pool, before, a.harbor.rewards.depth);
    a.harbor.docked += 1;
    a.sub.state = SubState::Docked;
    a.sub.harbor = a.harbor.key();
    let event_0 = Docked { owner: a.owner.key(), asset: a.asset.key(), depth: a.sub.depth };
    emit_cpi!(event_0);
    Ok(())
}

/// Never paused.
pub fn handle_undock(mut ctx: Context<DockAction>) -> Result<()> {
    let a = &mut ctx.accounts;
    require!(
        a.sub.state == SubState::Docked && a.sub.harbor == a.harbor.key(),
        ErrorCode::WrongSubState
    );
    let now = ops::now()?;
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

    core::set_frozen(
        &a.mpl_core,
        &a.asset,
        &a.collection,
        &a.authority,
        &a.owner,
        &a.system_program,
        false,
        &[&[AUTHORITY_SEED, &[a.config.authority_bump]]],
    )?;
    a.harbor.docked -= 1;
    a.sub.state = SubState::Idle;
    a.sub.harbor = Pubkey::default();
    let event_0 = Undocked { owner: a.owner.key(), asset: a.asset.key(), depth: a.sub.depth };
    emit_cpi!(event_0);
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [POOL_SEED], bump = config.pool_bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, seeds = [VAULT_SEED], bump = config.vault_bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, address = config.checkpoints)]
    pub checkpoints: AccountLoader<'info, Checkpoints>,
    #[account(mut, seeds = [HARBOR_SEED, owner.key().as_ref()], bump = harbor.bump)]
    pub harbor: Box<Account<'info, Harbor>>,
}

/// Never paused.
pub fn handle_claim(mut ctx: Context<Claim>) -> Result<()> {
    let a = &mut ctx.accounts;
    let amount = {
        let mut cps = a.checkpoints.load_mut()?;
        a.pool.rewards.claim(&mut a.harbor.rewards, ops::now()?, &mut *cps)?
    };
    if a.harbor.rewards.boost_extra == 0 {
        a.harbor.boost_sub = Pubkey::default();
    }
    a.harbor.total_claimed = a.harbor.total_claimed.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
    ops::pay_from_vault(&a.vault.to_account_info(), &a.owner.to_account_info(), amount)?;
    let event_0 = Claimed { owner: a.owner.key(), amount };
    emit_cpi!(event_0);
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct ExpandHarbor<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
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
    #[account(mut, seeds = [HARBOR_SEED, owner.key().as_ref()], bump = harbor.bump)]
    pub harbor: Box<Account<'info, Harbor>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_expand_harbor(mut ctx: Context<ExpandHarbor>) -> Result<()> {
    let a = &mut ctx.accounts;
    let p = &a.config.params;
    require!(!a.config.paused_upgrades, ErrorCode::UpgradesPaused);
    require!(a.harbor.slots < p.harbor_max_slots, ErrorCode::HarborMaxed);
    let fee = slot_cost(p, a.harbor.slots)?;
    let (to_pool, to_treasury) = {
        let mut cps = a.checkpoints.load_mut()?;
        ops::charge_fee(
            &a.owner,
            &a.vault.to_account_info(),
            &a.treasury,
            &mut a.pool,
            &mut *cps,
            p,
            fee,
            ops::now()?,
        )?
    };
    a.harbor.slots += 1;
    let event_0 = FeePaid { payer: a.owner.key(), kind: FeeKind::HarborSlot, amount: fee, to_pool, to_treasury };
    let event_1 = HarborExpanded { owner: a.owner.key(), slots: a.harbor.slots };
    emit_cpi!(event_0);
    emit_cpi!(event_1);
    Ok(())
}
