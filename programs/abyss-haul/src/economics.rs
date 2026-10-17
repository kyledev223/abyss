//! Prices, fee split and random rolls (DESIGN.md §2). Pure functions; unit-tested against
//! config/defaults.json in tests/economics.rs.

use anchor_lang::prelude::*;

use crate::constants::{BPS, TIERS};
use crate::error::ErrorCode;
use crate::state::Params;

/// base × (1 + level × bps_per_level), floored.
pub fn effective_depth(base: u64, level: u8, bps_per_level: u16) -> Result<u64> {
    let mult = BPS + level as u64 * bps_per_level as u64;
    let d = (base as u128 * mult as u128) / BPS as u128;
    Ok(u64::try_from(d).map_err(|_| ErrorCode::MathOverflow)?)
}

/// base × (growth_bps / 10000)^steps, rounding up at every step (in favour of the pool).
pub fn grow(base: u64, growth_bps: u16, steps: u32) -> Result<u64> {
    let mut v = base as u128;
    for _ in 0..steps {
        v = (v * growth_bps as u128).div_ceil(BPS as u128);
    }
    Ok(u64::try_from(v).map_err(|_| ErrorCode::MathOverflow)?)
}

/// Cost to go from `next_level - 1` to `next_level`:
/// lamports_per_depth × base_depth × growth^(next_level − 1). Equal payback for every tier.
pub fn reinforce_cost(p: &Params, base_depth: u64, next_level: u8) -> Result<u64> {
    let first = p
        .reinforce_lamports_per_depth
        .checked_mul(base_depth)
        .ok_or(ErrorCode::MathOverflow)?;
    grow(first, p.reinforce_growth_bps, next_level.saturating_sub(1) as u32)
}

/// Cost of the next dock slot for a harbor that currently has `slots`.
pub fn slot_cost(p: &Params, slots: u8) -> Result<u64> {
    grow(p.slot_base_lamports, p.slot_growth_bps, slots.saturating_sub(p.harbor_start_slots) as u32)
}

/// (to_pool, to_treasury); the pool share rounds up.
pub fn split_fee(fee: u64, pool_bps: u16) -> (u64, u64) {
    let to_pool = (fee as u128 * pool_bps as u128).div_ceil(BPS as u128) as u64;
    (to_pool, fee - to_pool)
}

fn roll(value: &[u8; 32]) -> u64 {
    // 2^64 mod 10000 bias is ~5e-16; negligible.
    u64::from_le_bytes(value[..8].try_into().unwrap()) % BPS
}

pub fn roll_tier(value: &[u8; 32], odds_bps: &[u16; TIERS]) -> u8 {
    let r = roll(value);
    let mut cumulative = 0u64;
    for (tier, odds) in odds_bps.iter().enumerate() {
        cumulative += *odds as u64;
        if r < cumulative {
            return tier as u8;
        }
    }
    (TIERS - 1) as u8 // unreachable when odds sum to 10000 (validated)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Find {
    Nothing,
    Barnacle { bit: u8 },
    Boost { extra: u64, duration: i64 },
}

/// Expedition outcome. Boost: +expedition_boost_bps of the sub's depth for
/// hours × expedition_boost_hours_per_hour hours (DESIGN.md §5 sizes it to roughly offset the
/// earnings lost while away).
pub fn expedition_find(value: &[u8; 32], p: &Params, sub_depth: u64, hours: u8) -> Result<Find> {
    let r = roll(value);
    let boost_cut = p.expedition_boost_chance_bps as u64;
    let barnacle_cut = boost_cut + p.expedition_barnacle_chance_bps as u64;
    Ok(if r < boost_cut {
        let extra = (sub_depth as u128 * p.expedition_boost_bps as u128 / BPS as u128).max(1);
        Find::Boost {
            extra: u64::try_from(extra).map_err(|_| ErrorCode::MathOverflow)?,
            duration: hours as i64 * p.expedition_boost_hours_per_hour as i64 * 3_600,
        }
    } else if r < barnacle_cut {
        Find::Barnacle { bit: value[8] % 16 }
    } else {
        Find::Nothing
    })
}
