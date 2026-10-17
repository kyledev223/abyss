use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::events::*;
use crate::external::core;
use crate::ops;
use crate::rewards::RewardState;
use crate::state::*;

/// One-time setup. Only the program's upgrade authority may call it, so nobody can front-run the
/// deploy and install themselves as admin. `admin` should be the Squads vault.
#[event_cpi]
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub deployer: Signer<'info>,
    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::ID,
        constraint = program_data.upgrade_authority_address == Some(deployer.key())
            @ ErrorCode::NotUpgradeAuthority,
    )]
    pub program_data: Account<'info, ProgramData>,
    #[account(init, payer = deployer, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(init, payer = deployer, space = 8 + Pool::INIT_SPACE, seeds = [POOL_SEED], bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(init, payer = deployer, space = 8 + Vault::INIT_SPACE, seeds = [VAULT_SEED], bump)]
    pub vault: Account<'info, Vault>,
    /// Created by a top-level create_account (owner = this program) earlier in the same transaction.
    #[account(zero)]
    pub checkpoints: AccountLoader<'info, Checkpoints>,
    /// CHECK: signer-only PDA; becomes the collection update authority.
    #[account(seeds = [AUTHORITY_SEED], bump)]
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub collection: Signer<'info>,
    /// CHECK: address-checked program.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(
    mut ctx: Context<Initialize>,
    admin: Pubkey,
    treasury: Pubkey,
    params: Params,
    uri_base: String,
    collection_uri: String,
) -> Result<()> {
    params.validate()?;
    require!(uri_base.len() <= MAX_URI_BASE_LEN, ErrorCode::InvalidParams);
    ctx.accounts.checkpoints.load_init()?;

    let a = &mut ctx.accounts;
    a.config.set_inner(Config {
        admin,
        pending_admin: Pubkey::default(),
        treasury,
        collection: a.collection.key(),
        checkpoints: a.checkpoints.key(),
        params,
        paused_mint: false,
        paused_upgrades: false,
        uri_base,
        bump: ctx.bumps.config,
        pool_bump: ctx.bumps.pool,
        vault_bump: ctx.bumps.vault,
        authority_bump: ctx.bumps.authority,
    });
    a.pool.set_inner(Pool {
        rewards: RewardState::new(ops::now()?),
        minted_count: 0,
        live_subs: 0,
        pending_mints: 0,
        active_harbors: 0,
        total_fees: 0,
        total_to_treasury: 0,
    });
    core::create_collection(
        &a.mpl_core,
        &a.collection,
        &a.authority,
        &a.deployer,
        &a.system_program,
        &collection_uri,
    )?;
    let event_0 = ConfigUpdated { admin };
    emit_cpi!(event_0);
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ ErrorCode::NotAdmin)]
    pub config: Box<Account<'info, Config>>,
}

/// Changes economics within bounds. Existing subs keep their recorded depth; a new window applies
/// from the next fee.
pub fn handle_update_config(
    ctx: Context<AdminOnly>,
    params: Params,
    treasury: Pubkey,
    uri_base: String,
) -> Result<()> {
    params.validate()?;
    require!(uri_base.len() <= MAX_URI_BASE_LEN, ErrorCode::InvalidParams);
    let c = &mut ctx.accounts.config;
    c.params = params;
    c.treasury = treasury;
    c.uri_base = uri_base;
    let event_0 = ConfigUpdated { admin: c.admin };
    emit_cpi!(event_0);
    Ok(())
}

/// Pauses minting and/or upgrades. Claims, undocking and expedition returns are never pausable.
pub fn handle_set_pause(ctx: Context<AdminOnly>, mint: bool, upgrades: bool) -> Result<()> {
    let c = &mut ctx.accounts.config;
    c.paused_mint = mint;
    c.paused_upgrades = upgrades;
    let event_0 = PauseSet { mint, upgrades };
    emit_cpi!(event_0);
    Ok(())
}

pub fn handle_propose_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_admin = new_admin;
    Ok(())
}

#[event_cpi]
#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    pub new_admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.pending_admin == new_admin.key() @ ErrorCode::NotPendingAdmin,
    )]
    pub config: Box<Account<'info, Config>>,
}

pub fn handle_accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
    let c = &mut ctx.accounts.config;
    c.admin = c.pending_admin;
    c.pending_admin = Pubkey::default();
    let event_0 = ConfigUpdated { admin: c.admin };
    emit_cpi!(event_0);
    Ok(())
}
