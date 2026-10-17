use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::events::*;
use crate::ops;
use crate::state::*;

/// Anyone may add SOL to the pool (e.g. launch seeding). 100% goes to players; it tops up the
/// stream without restarting the window.
#[event_cpi]
#[derive(Accounts)]
pub struct FundPool<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [POOL_SEED], bump = config.pool_bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, seeds = [VAULT_SEED], bump = config.vault_bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, address = config.checkpoints)]
    pub checkpoints: AccountLoader<'info, Checkpoints>,
    pub system_program: Program<'info, System>,
}

pub fn handle_fund_pool(mut ctx: Context<FundPool>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidParams);
    let a = &mut ctx.accounts;
    ops::transfer(&a.funder, &a.vault.to_account_info(), amount)?;
    {
        let mut cps = a.checkpoints.load_mut()?;
        a.pool.rewards.top_up(amount, ops::now()?, a.config.params.window, &mut *cps)?;
    }
    let event_0 = PoolFunded { funder: a.funder.key(), amount };
    emit_cpi!(event_0);
    Ok(())
}

/// Permissionless: advances the stream and applies boost expiries. Called by the keeper.
#[derive(Accounts)]
pub struct Crank<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [POOL_SEED], bump = config.pool_bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, address = config.checkpoints)]
    pub checkpoints: AccountLoader<'info, Checkpoints>,
}

pub fn handle_crank(ctx: Context<Crank>) -> Result<()> {
    let mut cps = ctx.accounts.checkpoints.load_mut()?;
    ctx.accounts.pool.rewards.accrue(ops::now()?, &mut *cps)
}

/// Permissionless: moves a harbor's pending rewards into its `owed` balance. It can only ever
/// credit the harbor's owner. The keeper calls it on harbors whose boost has expired.
#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [POOL_SEED], bump = config.pool_bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, address = config.checkpoints)]
    pub checkpoints: AccountLoader<'info, Checkpoints>,
    #[account(mut, seeds = [HARBOR_SEED, harbor.owner.as_ref()], bump = harbor.bump)]
    pub harbor: Box<Account<'info, Harbor>>,
}

pub fn handle_settle(mut ctx: Context<Settle>) -> Result<()> {
    let a = &mut ctx.accounts;
    let mut cps = a.checkpoints.load_mut()?;
    a.pool.rewards.settle(&mut a.harbor.rewards, ops::now()?, &mut *cps)?;
    if a.harbor.rewards.boost_extra == 0 {
        a.harbor.boost_sub = Pubkey::default();
    }
    Ok(())
}
