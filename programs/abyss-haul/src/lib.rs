pub mod constants;
pub mod economics;
pub mod error;
pub mod events;
pub mod external;
pub mod instructions;
pub mod ops;
pub mod rewards;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("9qe9i4BVKb3UzA9fAHfdpDnwCvymk7vBx4zkgGRBJw8o");

/// Abyss Haul. Instruction reference and formulas: docs/DESIGN.md.
#[program]
pub mod abyss_haul {
    use super::*;

    // Admin (Squads vault)
    pub fn initialize(
        ctx: Context<Initialize>,
        admin: Pubkey,
        treasury: Pubkey,
        params: Params,
        uri_base: String,
        collection_uri: String,
    ) -> Result<()> {
        instructions::admin::handle_initialize(ctx, admin, treasury, params, uri_base, collection_uri)
    }

    pub fn update_config(ctx: Context<AdminOnly>, params: Params, treasury: Pubkey, uri_base: String) -> Result<()> {
        instructions::admin::handle_update_config(ctx, params, treasury, uri_base)
    }

    pub fn set_pause(ctx: Context<AdminOnly>, mint: bool, upgrades: bool) -> Result<()> {
        instructions::admin::handle_set_pause(ctx, mint, upgrades)
    }

    pub fn propose_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        instructions::admin::handle_propose_admin(ctx, new_admin)
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        instructions::admin::handle_accept_admin(ctx)
    }

    // Pool
    pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
        instructions::pool::handle_fund_pool(ctx, amount)
    }

    pub fn crank(ctx: Context<Crank>) -> Result<()> {
        instructions::pool::handle_crank(ctx)
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        instructions::pool::handle_settle(ctx)
    }

    // Minting
    pub fn mint_commit(ctx: Context<MintCommit>, nonce: [u8; 32]) -> Result<()> {
        instructions::mint::handle_mint_commit(ctx, nonce)
    }

    pub fn mint_reveal(ctx: Context<MintReveal>) -> Result<()> {
        instructions::mint::handle_mint_reveal(ctx)
    }

    // Harbor
    pub fn open_harbor(ctx: Context<OpenHarbor>) -> Result<()> {
        instructions::harbor::handle_open_harbor(ctx)
    }

    pub fn dock(ctx: Context<DockAction>) -> Result<()> {
        instructions::harbor::handle_dock(ctx)
    }

    pub fn undock(ctx: Context<DockAction>) -> Result<()> {
        instructions::harbor::handle_undock(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::harbor::handle_claim(ctx)
    }

    pub fn expand_harbor(ctx: Context<ExpandHarbor>) -> Result<()> {
        instructions::harbor::handle_expand_harbor(ctx)
    }

    // Upgrades
    pub fn reinforce(ctx: Context<Reinforce>) -> Result<()> {
        instructions::upgrade::handle_reinforce(ctx)
    }

    pub fn merge(ctx: Context<Merge>) -> Result<()> {
        instructions::upgrade::handle_merge(ctx)
    }

    // Expeditions
    pub fn expedition_start(ctx: Context<ExpeditionStart>, hours: u8) -> Result<()> {
        instructions::expedition::handle_expedition_start(ctx, hours)
    }

    pub fn expedition_return_commit(ctx: Context<ExpeditionReturnCommit>, nonce: [u8; 32]) -> Result<()> {
        instructions::expedition::handle_expedition_return_commit(ctx, nonce)
    }

    pub fn expedition_return_reveal(ctx: Context<ExpeditionReturnReveal>) -> Result<()> {
        instructions::expedition::handle_expedition_return_reveal(ctx)
    }
}
