use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::rewards::{CheckpointStore, HarborRewards, RewardState, CHECKPOINT_RING};

/// Global settings. Seeds: ["config"]. Admin is the Squads vault (DESIGN.md §9).
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Two-step admin transfer; Pubkey::default() when none.
    pub pending_admin: Pubkey,
    pub treasury: Pubkey,
    pub collection: Pubkey,
    /// Address of the `Checkpoints` keypair account.
    pub checkpoints: Pubkey,
    pub params: Params,
    pub paused_mint: bool,
    pub paused_upgrades: bool,
    /// Metadata URI prefix; the asset address is appended.
    #[max_len(MAX_URI_BASE_LEN)]
    pub uri_base: String,
    pub bump: u8,
    pub pool_bump: u8,
    pub vault_bump: u8,
    pub authority_bump: u8,
}

/// Tunable economics (config/defaults.json). Every change is bounds-checked by `validate`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, InitSpace)]
pub struct Params {
    pub mint_price: u64,
    pub pool_bps: u16,
    pub window: i64,
    pub tier_odds_bps: [u16; TIERS],
    pub tier_depth: [u64; TIERS],
    pub reinforce_bps_per_level: u16,
    pub reinforce_max_level: u8,
    pub reinforce_lamports_per_depth: u64,
    pub reinforce_growth_bps: u16,
    pub merge_fee: [u64; MERGEABLE_TIERS],
    pub harbor_start_slots: u8,
    pub harbor_max_slots: u8,
    pub slot_base_lamports: u64,
    pub slot_growth_bps: u16,
    pub max_live_subs: u32,
    pub expedition_boost_bps: u16,
    pub expedition_boost_hours_per_hour: u8,
    pub expedition_boost_chance_bps: u16,
    pub expedition_barnacle_chance_bps: u16,
}

impl Params {
    pub fn validate(&self) -> Result<()> {
        let odds: u64 = self.tier_odds_bps.iter().map(|o| *o as u64).sum();
        let depths_increase = self.tier_depth.windows(2).all(|w| w[0] < w[1]);
        let chances = self.expedition_boost_chance_bps as u64 + self.expedition_barnacle_chance_bps as u64;
        let max_boost_hours = MAX_EXPEDITION_HOURS as i64 * self.expedition_boost_hours_per_hour as i64;
        require!(
            self.mint_price > 0
                && (MIN_POOL_BPS..=BPS as u16).contains(&self.pool_bps)
                && (MIN_WINDOW..=MAX_WINDOW).contains(&self.window)
                && odds == BPS
                && self.tier_depth[0] > 0
                && depths_increase
                && self.reinforce_max_level <= MAX_REINFORCE_LEVEL
                && self.reinforce_lamports_per_depth > 0
                && (BPS as u16..=MAX_GROWTH_BPS).contains(&self.reinforce_growth_bps)
                && self.merge_fee.iter().all(|f| *f > 0)
                && self.harbor_start_slots >= 1
                && self.harbor_start_slots <= self.harbor_max_slots
                && self.harbor_max_slots <= MAX_HARBOR_SLOTS
                && self.slot_base_lamports > 0
                && (BPS as u16..=MAX_GROWTH_BPS).contains(&self.slot_growth_bps)
                && self.max_live_subs > 0
                && chances <= BPS
                && (1..=MAX_BOOST_HOURS).contains(&max_boost_hours),
            ErrorCode::InvalidParams
        );
        Ok(())
    }
}

/// Reward accounting and fleet counters. Seeds: ["pool"].
#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub rewards: RewardState,
    /// Next mint index (also counts merge outputs). Asset PDAs are ["asset", index].
    pub minted_count: u64,
    pub live_subs: u32,
    pub pending_mints: u32,
    /// Harbors with depth > 0.
    pub active_harbors: u32,
    pub total_fees: u64,
    pub total_to_treasury: u64,
}

/// Holds pool lamports only. Seeds: ["vault"]. Only `claim` moves lamports out.
#[account]
#[derive(InitSpace)]
pub struct Vault {}

/// One per player. Seeds: ["harbor", owner].
#[account]
#[derive(InitSpace)]
pub struct Harbor {
    pub owner: Pubkey,
    pub slots: u8,
    /// Subs in dock slots, including any away on an expedition.
    pub docked: u8,
    pub rewards: HarborRewards,
    /// Sub whose expedition produced the active boost; default when none.
    pub boost_sub: Pubkey,
    /// Sub currently on an expedition; default when none.
    pub expedition_sub: Pubkey,
    pub last_expedition_return: i64,
    pub total_claimed: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum SubState {
    Idle,
    Docked,
    /// On an expedition; earns nothing.
    Away,
    /// Back from the expedition, waiting for its randomness reveal; earns nothing.
    Returning,
}

/// Stats for one sub. Seeds: ["sub", asset].
#[account]
#[derive(InitSpace)]
pub struct Sub {
    pub asset: Pubkey,
    pub mint_index: u64,
    pub tier: u8,
    pub level: u8,
    /// Tier depth at mint time (later config changes do not affect existing subs).
    pub base_depth: u64,
    /// base_depth with reinforcement; what the sub contributes while docked.
    pub depth: u64,
    pub barnacles: u16,
    pub state: SubState,
    /// Harbor while docked, away or returning; default when idle.
    pub harbor: Pubkey,
    pub away_until: i64,
    pub away_hours: u8,
    pub randomness: Pubkey,
    pub seed_slot: u64,
    pub committed_at: i64,
    pub bump: u8,
}

/// A paid mint awaiting its randomness. Seeds: ["pending", mint_index].
#[account]
#[derive(InitSpace)]
pub struct PendingMint {
    pub payer: Pubkey,
    pub mint_index: u64,
    pub randomness: Pubkey,
    pub seed_slot: u64,
    pub committed_at: i64,
    pub bump: u8,
}

/// Ring of accumulator snapshots at hour boundaries where boosts expired (DESIGN.md §5).
/// 17 KB, larger than a CPI-created account may be, so it is a keypair account created in the
/// initialize transaction; its address is bound in `Config`.
#[account(zero_copy)]
pub struct Checkpoints {
    pub entries: [Checkpoint; CHECKPOINT_RING],
}

/// u128 split into halves so the layout is identical on the host and on SBF.
#[zero_copy]
pub struct Checkpoint {
    pub hour: i64,
    pub acc_lo: u64,
    pub acc_hi: u64,
}

impl Checkpoints {
    pub fn empty() -> Self {
        Self { entries: [Checkpoint { hour: 0, acc_lo: 0, acc_hi: 0 }; CHECKPOINT_RING] }
    }
}

impl CheckpointStore for Checkpoints {
    fn record(&mut self, hour: i64, acc: u128) {
        let e = &mut self.entries[hour.rem_euclid(CHECKPOINT_RING as i64) as usize];
        e.hour = hour;
        e.acc_lo = acc as u64;
        e.acc_hi = (acc >> 64) as u64;
    }

    fn get(&self, hour: i64) -> Option<u128> {
        let e = &self.entries[hour.rem_euclid(CHECKPOINT_RING as i64) as usize];
        (e.hour == hour).then(|| (u128::from(e.acc_hi) << 64) | u128::from(e.acc_lo))
    }
}
