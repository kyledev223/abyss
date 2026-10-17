//! Reward engine (docs/DESIGN.md §4–§5).
//!
//! Pure integer math over plain structs; every instruction that touches rewards goes through
//! here, and the property tests in `tests/solvency_engine.rs` exercise it directly.
//!
//! - Accumulator: `acc_per_depth` grows by `released * P / total_depth`; a harbor's pending
//!   reward is `depth * (acc_per_depth - acc_snapshot) / P`.
//! - Stream: Synthetix rolling reset. Each deposit re-spreads everything not yet released over a
//!   fresh window. With zero total depth the stream pauses (its end moves forward).
//! - Boosts end on hour boundaries. Scheduled decreases sit in a 32-slot ring and are applied by
//!   `accrue` exactly at the boundary, which also records a checkpoint of the accumulator.
//! - Every rounding favours the vault: credits reserve `ceil`, harbors receive `floor`.

use anchor_lang::prelude::*;

use crate::error::ErrorCode;

/// Fixed-point scale of `acc_per_depth`.
pub const ACC_PRECISION: u128 = 1_000_000_000_000;
pub const HOUR: i64 = 3600;
/// Slots in the boost-expiry ring. Boosts may end at most `MAX_BOOST_HOURS_AHEAD` hours ahead.
pub const BOOST_RING: usize = 32;
pub const MAX_BOOST_HOURS_AHEAD: i64 = BOOST_RING as i64 - 1;
/// Hourly checkpoints kept (30 days). Older ones are overwritten; see `settle`.
pub const CHECKPOINT_RING: usize = 720;

/// Stores the accumulator value at hour boundaries where boosts expired.
pub trait CheckpointStore {
    fn record(&mut self, hour: i64, acc: u128);
    fn get(&self, hour: i64) -> Option<u128>;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, InitSpace)]
pub struct RewardState {
    pub acc_per_depth: u128,
    /// Sum of docked harbor depths plus boosts that have not reached their end boundary.
    pub total_depth: u64,
    /// Lamports deposited but not yet credited to the accumulator.
    pub stream_remaining: u64,
    pub stream_end: i64,
    pub last_update: i64,
    pub total_deposited: u64,
    /// Lamports reserved for harbors through the accumulator.
    pub total_credited: u64,
    pub total_claimed: u64,
    pub boost_amount: [u64; BOOST_RING],
    pub boost_hour: [i64; BOOST_RING],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq, Eq, InitSpace)]
pub struct HarborRewards {
    /// Depth of docked subs that are not away. Excludes the boost.
    pub depth: u64,
    pub boost_extra: u64,
    pub boost_end_hour: i64,
    pub acc_snapshot: u128,
    pub owed: u64,
}

impl RewardState {
    pub fn new(now: i64) -> Self {
        Self {
            acc_per_depth: 0,
            total_depth: 0,
            stream_remaining: 0,
            stream_end: now,
            last_update: now,
            total_deposited: 0,
            total_credited: 0,
            total_claimed: 0,
            boost_amount: [0; BOOST_RING],
            boost_hour: [0; BOOST_RING],
        }
    }

    /// Brings the stream and accumulator up to `now`, applying boost expiries on their boundaries.
    /// A clock earlier than `last_update` is treated as `last_update`.
    pub fn accrue(&mut self, now: i64, cps: &mut impl CheckpointStore) -> Result<()> {
        if now <= self.last_update {
            return Ok(());
        }
        // Every pending boost hour is at most MAX_BOOST_HOURS_AHEAD past the hour of last_update
        // (enforced in grant_boost, and last_update only moves forward), so this scan covers them all.
        let first = hour_of(self.last_update) + 1;
        let last = hour_of(now).min(first - 1 + MAX_BOOST_HOURS_AHEAD);
        for hour in first..=last {
            let i = slot(hour);
            if self.boost_hour[i] == hour && self.boost_amount[i] > 0 {
                self.stream_to(hour_start(hour)?)?;
                self.total_depth = sub(self.total_depth, self.boost_amount[i])?;
                self.boost_amount[i] = 0;
                cps.record(hour, self.acc_per_depth);
            }
        }
        self.stream_to(now)
    }

    /// Adds fee lamports to the stream and restarts the window (Synthetix rolling reset).
    pub fn deposit(
        &mut self,
        amount: u64,
        now: i64,
        window: i64,
        cps: &mut impl CheckpointStore,
    ) -> Result<()> {
        self.accrue(now, cps)?;
        let now = now.max(self.last_update);
        self.stream_remaining = add(self.stream_remaining, amount)?;
        self.total_deposited = add(self.total_deposited, amount)?;
        self.stream_end = now.checked_add(window).ok_or(ErrorCode::MathOverflow)?;
        Ok(())
    }

    /// Adds lamports to the stream without restarting the window, so cheap repeated donations
    /// cannot be used to stretch everyone's payouts. Starts a fresh window only if the stream ended.
    pub fn top_up(
        &mut self,
        amount: u64,
        now: i64,
        window: i64,
        cps: &mut impl CheckpointStore,
    ) -> Result<()> {
        self.accrue(now, cps)?;
        let now = now.max(self.last_update);
        self.stream_remaining = add(self.stream_remaining, amount)?;
        self.total_deposited = add(self.total_deposited, amount)?;
        if self.stream_end <= now {
            self.stream_end = now.checked_add(window).ok_or(ErrorCode::MathOverflow)?;
        }
        Ok(())
    }

    /// Moves a harbor's pending reward into `owed`. Must run before any change to its depth.
    pub fn settle(
        &mut self,
        h: &mut HarborRewards,
        now: i64,
        cps: &mut impl CheckpointStore,
    ) -> Result<()> {
        self.accrue(now, cps)?;
        let acc = self.acc_per_depth;
        let depth = h.depth as u128;
        let boost_expired =
            h.boost_extra > 0 && hour_start(h.boost_end_hour)? <= self.last_update;
        let earned = if boost_expired {
            let full = depth + h.boost_extra as u128;
            let earned = match cps.get(h.boost_end_hour) {
                Some(acc_end) if acc_end >= h.acc_snapshot && acc_end <= acc => add128(
                    mul128(full, acc_end - h.acc_snapshot)?,
                    mul128(depth, acc - acc_end)?,
                )?,
                // Checkpoint overwritten (harbor untouched for 30+ days after the boost ended):
                // credit base depth only for the whole interval. The boost portion stays in the vault.
                _ => mul128(depth, sub128(acc, h.acc_snapshot)?)?,
            };
            h.boost_extra = 0;
            h.boost_end_hour = 0;
            earned
        } else {
            mul128(depth + h.boost_extra as u128, sub128(acc, h.acc_snapshot)?)?
        };
        let earned = u64::try_from(earned / ACC_PRECISION).map_err(|_| ErrorCode::MathOverflow)?;
        h.owed = add(h.owed, earned)?;
        h.acc_snapshot = acc;
        Ok(())
    }

    pub fn add_depth(
        &mut self,
        h: &mut HarborRewards,
        amount: u64,
        now: i64,
        cps: &mut impl CheckpointStore,
    ) -> Result<()> {
        self.settle(h, now, cps)?;
        h.depth = add(h.depth, amount)?;
        self.total_depth = add(self.total_depth, amount)?;
        Ok(())
    }

    pub fn remove_depth(
        &mut self,
        h: &mut HarborRewards,
        amount: u64,
        now: i64,
        cps: &mut impl CheckpointStore,
    ) -> Result<()> {
        self.settle(h, now, cps)?;
        require!(h.depth >= amount, ErrorCode::InsufficientDepth);
        h.depth -= amount;
        self.total_depth = sub(self.total_depth, amount)?;
        Ok(())
    }

    /// Grants `extra` depth until the first hour boundary at or after `now + duration`.
    pub fn grant_boost(
        &mut self,
        h: &mut HarborRewards,
        extra: u64,
        duration: i64,
        now: i64,
        cps: &mut impl CheckpointStore,
    ) -> Result<()> {
        self.settle(h, now, cps)?;
        require!(h.boost_extra == 0, ErrorCode::BoostAlreadyActive);
        let now = now.max(self.last_update);
        require!(duration > 0 && extra > 0, ErrorCode::InvalidBoostWindow);
        let end = now.checked_add(duration).ok_or(ErrorCode::MathOverflow)?;
        let end_hour = end.div_euclid(HOUR) + i64::from(end.rem_euclid(HOUR) != 0);
        require!(
            hour_start(end_hour)? > now && end_hour - hour_of(now) <= MAX_BOOST_HOURS_AHEAD,
            ErrorCode::InvalidBoostWindow
        );
        let i = slot(end_hour);
        if self.boost_hour[i] != end_hour {
            require!(self.boost_amount[i] == 0, ErrorCode::BoostRingCollision);
            self.boost_hour[i] = end_hour;
        }
        self.boost_amount[i] = add(self.boost_amount[i], extra)?;
        self.total_depth = add(self.total_depth, extra)?;
        h.boost_extra = extra;
        h.boost_end_hour = end_hour;
        Ok(())
    }

    /// Ends a harbor's boost early (sub undocked, merged, or sent out). No-op if none is active.
    pub fn cancel_boost(
        &mut self,
        h: &mut HarborRewards,
        now: i64,
        cps: &mut impl CheckpointStore,
    ) -> Result<()> {
        // settle clears a boost that has already reached its boundary.
        self.settle(h, now, cps)?;
        if h.boost_extra == 0 {
            return Ok(());
        }
        let i = slot(h.boost_end_hour);
        require!(self.boost_hour[i] == h.boost_end_hour, ErrorCode::BoostRingCollision);
        self.boost_amount[i] = sub(self.boost_amount[i], h.boost_extra)?;
        self.total_depth = sub(self.total_depth, h.boost_extra)?;
        h.boost_extra = 0;
        h.boost_end_hour = 0;
        Ok(())
    }

    /// Settles and returns the full `owed` amount, which the caller pays from the vault.
    pub fn claim(
        &mut self,
        h: &mut HarborRewards,
        now: i64,
        cps: &mut impl CheckpointStore,
    ) -> Result<u64> {
        self.settle(h, now, cps)?;
        let amount = h.owed;
        h.owed = 0;
        self.total_claimed = add(self.total_claimed, amount)?;
        Ok(amount)
    }

    /// Releases the stream linearly from `last_update` to `t` at the current `total_depth`.
    fn stream_to(&mut self, t: i64) -> Result<()> {
        if t <= self.last_update {
            return Ok(());
        }
        if self.total_depth == 0 {
            // Nobody to pay: pause the stream so nothing is released into the void.
            if self.last_update < self.stream_end {
                self.stream_end = self
                    .stream_end
                    .checked_add(t - self.last_update)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        } else if self.stream_remaining > 0 && self.last_update < self.stream_end {
            let end = t.min(self.stream_end);
            let released = if end == self.stream_end {
                self.stream_remaining
            } else {
                let num = mul128(
                    self.stream_remaining as u128,
                    (end - self.last_update) as u128,
                )?;
                (num / (self.stream_end - self.last_update) as u128) as u64
            };
            self.credit(released)?;
        }
        self.last_update = t;
        Ok(())
    }

    /// Credits `released` to the accumulator. Reserves `ceil(delta * total / P)` lamports, which
    /// covers the floored share of every harbor; the remainder (< 1 lamport per credit at realistic
    /// depths) stays in the stream for later release.
    fn credit(&mut self, released: u64) -> Result<()> {
        let total = self.total_depth as u128;
        let delta = mul128(released as u128, ACC_PRECISION)? / total;
        if delta == 0 {
            return Ok(());
        }
        let reserved = u64::try_from(mul128(delta, total)?.div_ceil(ACC_PRECISION))
            .map_err(|_| ErrorCode::MathOverflow)?;
        self.acc_per_depth = add128(self.acc_per_depth, delta)?;
        self.stream_remaining = sub(self.stream_remaining, reserved)?;
        self.total_credited = add(self.total_credited, reserved)?;
        Ok(())
    }
}

pub fn hour_of(t: i64) -> i64 {
    t.div_euclid(HOUR)
}

fn hour_start(hour: i64) -> Result<i64> {
    Ok(hour.checked_mul(HOUR).ok_or(ErrorCode::MathOverflow)?)
}

fn slot(hour: i64) -> usize {
    hour.rem_euclid(BOOST_RING as i64) as usize
}

fn add(a: u64, b: u64) -> Result<u64> {
    Ok(a.checked_add(b).ok_or(ErrorCode::MathOverflow)?)
}

fn sub(a: u64, b: u64) -> Result<u64> {
    Ok(a.checked_sub(b).ok_or(ErrorCode::MathOverflow)?)
}

fn add128(a: u128, b: u128) -> Result<u128> {
    Ok(a.checked_add(b).ok_or(ErrorCode::MathOverflow)?)
}

fn sub128(a: u128, b: u128) -> Result<u128> {
    Ok(a.checked_sub(b).ok_or(ErrorCode::MathOverflow)?)
}

fn mul128(a: u128, b: u128) -> Result<u128> {
    Ok(a.checked_mul(b).ok_or(ErrorCode::MathOverflow)?)
}
