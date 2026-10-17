use anchor_lang::prelude::*;

use crate::constants::*;
use crate::economics::{effective_depth, reinforce_cost};
use crate::error::ErrorCode;
use crate::events::*;
use crate::external::core;
use crate::ops;
use crate::state::*;

/// A sub may be upgraded while idle in the owner's wallet or docked in the owner's harbor.
fn check_owned(sub: &Sub, harbor: &Account<Harbor>, asset: &AccountInfo, owner: &Pubkey, collection: &Pubkey) -> Result<bool> {
    match sub.state {
        SubState::Docked => {
            require_keys_eq!(sub.harbor, harbor.key(), ErrorCode::NotOwner);
            Ok(true)
        }
        SubState::Idle => {
            require_keys_eq!(core::asset_owner(asset, collection)?, *owner, ErrorCode::NotOwner);
            Ok(false)
        }
        _ => err!(ErrorCode::WrongSubState),
    }
}

#[event_cpi]
#[derive(Accounts)]
pub struct Reinforce<'info> {
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
    #[account(mut, seeds = [SUB_SEED, asset.key().as_ref()], bump = sub.bump)]
    pub sub: Box<Account<'info, Sub>>,
    /// CHECK: the Core asset for `sub` (seed-bound); read for ownership when idle.
    pub asset: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_reinforce(mut ctx: Context<Reinforce>) -> Result<()> {
    let a = &mut ctx.accounts;
    let p = &a.config.params;
    require!(!a.config.paused_upgrades, ErrorCode::UpgradesPaused);
    let docked = check_owned(&a.sub, &a.harbor, &a.asset, &a.owner.key(), &a.config.collection)?;
    require!(a.sub.level < p.reinforce_max_level, ErrorCode::MaxLevel);

    let level = a.sub.level + 1;
    let fee = reinforce_cost(p, a.sub.base_depth, level)?;
    let new_depth = effective_depth(a.sub.base_depth, level, p.reinforce_bps_per_level)?;
    let now = ops::now()?;
    let (to_pool, to_treasury) = {
        let mut cps = a.checkpoints.load_mut()?;
        let paid = ops::charge_fee(
            &a.owner,
            &a.vault.to_account_info(),
            &a.treasury,
            &mut a.pool,
            &mut *cps,
            p,
            fee,
            now,
        )?;
        if docked {
            a.pool.rewards.add_depth(&mut a.harbor.rewards, new_depth - a.sub.depth, now, &mut *cps)?;
        }
        paid
    };
    a.sub.level = level;
    a.sub.depth = new_depth;
    let event_0 = FeePaid { payer: a.owner.key(), kind: FeeKind::Reinforce, amount: fee, to_pool, to_treasury };
    let event_1 = Reinforced { owner: a.owner.key(), asset: a.asset.key(), level, depth: new_depth };
    emit_cpi!(event_0);
    emit_cpi!(event_1);
    Ok(())
}

/// Burns two same-tier subs and mints one of the next tier. The new sub is docked if either input
/// was docked (freeing a slot when both were). Reduces live supply by one.
#[event_cpi]
#[derive(Accounts)]
pub struct Merge<'info> {
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
    #[account(mut, close = owner, seeds = [SUB_SEED, asset_a.key().as_ref()], bump = sub_a.bump)]
    pub sub_a: Box<Account<'info, Sub>>,
    #[account(mut, close = owner, seeds = [SUB_SEED, asset_b.key().as_ref()], bump = sub_b.bump)]
    pub sub_b: Box<Account<'info, Sub>>,
    /// CHECK: Core asset for `sub_a` (seed-bound).
    #[account(mut)]
    pub asset_a: UncheckedAccount<'info>,
    /// CHECK: Core asset for `sub_b` (seed-bound).
    #[account(mut)]
    pub asset_b: UncheckedAccount<'info>,
    /// CHECK: created by Core at this PDA.
    #[account(mut, seeds = [ASSET_SEED, &pool.minted_count.to_le_bytes()], bump)]
    pub new_asset: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Sub::INIT_SPACE,
        seeds = [SUB_SEED, new_asset.key().as_ref()],
        bump,
    )]
    pub new_sub: Box<Account<'info, Sub>>,
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

pub fn handle_merge(mut ctx: Context<Merge>) -> Result<()> {
    let a = &mut ctx.accounts;
    let p = &a.config.params;
    require!(!a.config.paused_upgrades, ErrorCode::UpgradesPaused);
    let tier = a.sub_a.tier;
    require!(
        a.asset_a.key() != a.asset_b.key() && a.sub_b.tier == tier && (tier as usize) < TIERS - 1,
        ErrorCode::InvalidMerge
    );
    let collection_key = a.config.collection;
    let docked_a = check_owned(&a.sub_a, &a.harbor, &a.asset_a, &a.owner.key(), &collection_key)?;
    let docked_b = check_owned(&a.sub_b, &a.harbor, &a.asset_b, &a.owner.key(), &collection_key)?;

    let now = ops::now()?;
    let fee = p.merge_fee[tier as usize];
    let authority_seeds: &[&[&[u8]]] = &[&[AUTHORITY_SEED, &[a.config.authority_bump]]];
    let before = a.harbor.rewards.depth;
    let (to_pool, to_treasury) = {
        let mut cps = a.checkpoints.load_mut()?;
        let paid = ops::charge_fee(
            &a.owner,
            &a.vault.to_account_info(),
            &a.treasury,
            &mut a.pool,
            &mut *cps,
            p,
            fee,
            now,
        )?;
        for (docked, sub) in [(docked_a, &a.sub_a), (docked_b, &a.sub_b)] {
            if !docked {
                continue;
            }
            if a.harbor.boost_sub == sub.key() {
                a.pool.rewards.cancel_boost(&mut a.harbor.rewards, now, &mut *cps)?;
                a.harbor.boost_sub = Pubkey::default();
            }
            a.pool.rewards.remove_depth(&mut a.harbor.rewards, sub.depth, now, &mut *cps)?;
        }
        paid
    };
    for (docked, asset) in [(docked_a, &a.asset_a), (docked_b, &a.asset_b)] {
        if docked {
            core::set_frozen(&a.mpl_core, asset, &a.collection, &a.authority, &a.owner, &a.system_program, false, authority_seeds)?;
        }
        core::burn(&a.mpl_core, asset, &a.collection, &a.owner, &a.system_program)?;
    }

    let index = a.pool.minted_count;
    let new_tier = tier + 1;
    let depth = p.tier_depth[new_tier as usize];
    core::create_asset(
        &a.mpl_core,
        &a.new_asset,
        &a.collection,
        &a.authority,
        &a.owner,
        &a.owner,
        &a.system_program,
        &format!("{NAME_PREFIX}{}", index + 1),
        &format!("{}{}", a.config.uri_base, a.new_asset.key()),
        &[
            &[ASSET_SEED, &index.to_le_bytes(), &[ctx.bumps.new_asset]],
            &[AUTHORITY_SEED, &[a.config.authority_bump]],
        ],
    )?;
    a.pool.minted_count += 1;

    let docked_inputs = docked_a as u8 + docked_b as u8;
    let state = if docked_inputs > 0 {
        core::set_frozen(&a.mpl_core, &a.new_asset, &a.collection, &a.authority, &a.owner, &a.system_program, true, authority_seeds)?;
        let mut cps = a.checkpoints.load_mut()?;
        a.pool.rewards.add_depth(&mut a.harbor.rewards, depth, now, &mut *cps)?;
        a.harbor.docked -= docked_inputs - 1;
        SubState::Docked
    } else {
        SubState::Idle
    };
    ops::track_active(&mut a.pool, before, a.harbor.rewards.depth);

    a.new_sub.set_inner(Sub {
        asset: a.new_asset.key(),
        mint_index: index,
        tier: new_tier,
        level: 0,
        base_depth: depth,
        depth,
        barnacles: a.sub_a.barnacles | a.sub_b.barnacles,
        state,
        harbor: if state == SubState::Docked { a.harbor.key() } else { Pubkey::default() },
        away_until: 0,
        away_hours: 0,
        randomness: Pubkey::default(),
        vrf_seed: [0; 32],
        committed_at: 0,
        bump: ctx.bumps.new_sub,
    });
    a.pool.live_subs -= 1;
    let event_0 = FeePaid { payer: a.owner.key(), kind: FeeKind::Merge, amount: fee, to_pool, to_treasury };
    let event_1 = Merged {
        owner: a.owner.key(),
        burned: [a.asset_a.key(), a.asset_b.key()],
        asset: a.new_asset.key(),
        tier: new_tier,
        depth,
    };
    emit_cpi!(event_0);
    emit_cpi!(event_1);
    Ok(())
}
