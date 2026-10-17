//! Deterministic reward-engine edge cases (DESIGN.md §13, layer 2).
//!
//! Most tests deposit 43.2 SOL into a 12 h window, which streams exactly 1,000,000 lamports per
//! second, so expected splits are exact to the lamport.

use abyss_haul::rewards::*;
use abyss_haul::state::Checkpoints;

const W: i64 = 12 * HOUR;
const POOL: u64 = 43_200_000_000; // 1e6 lamports/s over W
const RATE: u64 = 1_000_000;
const HB: i64 = 488_889; // an hour index near Oct 2025
const TB: i64 = HB * HOUR; // on an hour boundary
const T: i64 = TB + 1_200; // 20 minutes past it

fn setup(t: i64) -> (RewardState, Box<Checkpoints>) {
    (RewardState::new(t), Box::new(Checkpoints::empty()))
}

fn docked(p: &mut RewardState, c: &mut Checkpoints, depth: u64, t: i64) -> HarborRewards {
    let mut h = HarborRewards::default();
    p.add_depth(&mut h, depth, t, c).unwrap();
    h
}

/// deposited − claimed − (stream + Σ owed after settling everyone at `now`)
fn surplus(p: &RewardState, c: &Checkpoints, harbors: &[&HarborRewards], now: i64) -> i128 {
    let (mut p, mut c) = (p.clone(), Box::new(*c));
    let mut owed = 0i128;
    for h in harbors {
        let mut h = (*h).clone();
        p.settle(&mut h, now, &mut *c).unwrap();
        owed += h.owed as i128;
    }
    (p.total_deposited - p.total_claimed) as i128 - p.stream_remaining as i128 - owed
}

#[test]
fn zero_subs_pauses_the_stream() {
    let (mut p, mut c) = setup(T);
    p.deposit(POOL, T, W, &mut *c).unwrap();
    p.accrue(T + 24 * HOUR, &mut *c).unwrap();
    assert_eq!(p.stream_remaining, POOL, "nothing released while nobody is docked");
    assert_eq!(p.stream_end, T + 24 * HOUR + W, "window end moved forward by the pause");

    let t = T + 24 * HOUR;
    let mut h = docked(&mut p, &mut c, 100, t);
    assert_eq!(p.claim(&mut h, t + W / 2, &mut *c).unwrap(), POOL / 2);
    assert_eq!(p.claim(&mut h, t + W, &mut *c).unwrap(), POOL / 2);
    assert_eq!(p.stream_remaining, 0);
}

#[test]
fn one_sub_gets_everything() {
    let (mut p, mut c) = setup(T);
    let mut h = docked(&mut p, &mut c, 7, T);
    let amount = 1_000_000_007;
    p.deposit(amount, T, W, &mut *c).unwrap();
    let got = p.claim(&mut h, T + W, &mut *c).unwrap();
    assert!(amount - got <= 1, "got {got} of {amount}");
    // Reserved with ceil, paid with floor: the vault keeps at most 1 lamport of dust.
    let dust = surplus(&p, &c, &[&h], T + W);
    assert!((0..=1).contains(&dust), "dust {dust}");
}

#[test]
fn claim_mid_window_is_linear() {
    let (mut p, mut c) = setup(T);
    let mut h = docked(&mut p, &mut c, 100, T);
    p.deposit(POOL, T, W, &mut *c).unwrap();
    assert_eq!(p.claim(&mut h, T + 3 * HOUR, &mut *c).unwrap(), 3 * 3600 * RATE);
    assert_eq!(p.claim(&mut h, T + 3 * HOUR, &mut *c).unwrap(), 0, "double claim pays nothing");
    assert_eq!(p.claim(&mut h, T + 9 * HOUR, &mut *c).unwrap(), 6 * 3600 * RATE);
    assert_eq!(p.claim(&mut h, T + 48 * HOUR, &mut *c).unwrap(), 3 * 3600 * RATE);
}

#[test]
fn drains_exactly_one_window_after_the_last_fee() {
    let (mut p, mut c) = setup(T);
    let mut h = docked(&mut p, &mut c, 100, T);
    p.deposit(POOL, T, W, &mut *c).unwrap();
    let t2 = T + 5 * HOUR;
    p.deposit(POOL, t2, W, &mut *c).unwrap();
    // Rolling reset: what was left of the first fee plus the second, spread over a fresh window.
    assert_eq!(p.stream_remaining, POOL - 5 * 3600 * RATE + POOL);
    assert_eq!(p.stream_end, t2 + W);

    p.accrue(t2 + W - 1, &mut *c).unwrap();
    assert!(p.stream_remaining > 0);
    p.accrue(t2 + W, &mut *c).unwrap();
    assert!(p.stream_remaining <= 1, "left {}", p.stream_remaining);
    let got = p.claim(&mut h, t2 + W, &mut *c).unwrap();
    assert!(2 * POOL - got <= 2);
}

#[test]
fn top_up_does_not_stretch_the_window() {
    let (mut p, mut c) = setup(T);
    let mut h = docked(&mut p, &mut c, 100, T);
    p.deposit(POOL, T, W, &mut *c).unwrap();
    // A griefer donates 1 lamport every hour; the window end must not move.
    for k in 1..12 {
        p.top_up(1, T + k * HOUR, W, &mut *c).unwrap();
        assert_eq!(p.stream_end, T + W);
    }
    let got = p.claim(&mut h, T + W, &mut *c).unwrap();
    assert!(POOL + 11 - got <= 12, "everything paid by the original end");
    // After the stream has ended, a top-up starts a fresh window.
    p.top_up(POOL, T + W + HOUR, W, &mut *c).unwrap();
    assert_eq!(p.stream_end, T + W + HOUR + W);
}

#[test]
fn pro_rata_by_depth() {
    let (mut p, mut c) = setup(T);
    let mut a = docked(&mut p, &mut c, 100, T);
    let mut b = docked(&mut p, &mut c, 300, T);
    p.deposit(POOL, T, W, &mut *c).unwrap();
    assert_eq!(p.claim(&mut a, T + W, &mut *c).unwrap(), POOL / 4);
    assert_eq!(p.claim(&mut b, T + W, &mut *c).unwrap(), POOL / 4 * 3);
}

#[test]
fn per_sub_earnings_fall_as_the_fleet_grows() {
    let (mut p, mut c) = setup(T);
    let mut a = docked(&mut p, &mut c, 100, T);
    p.deposit(POOL, T, W, &mut *c).unwrap();
    assert_eq!(p.claim(&mut a, T + HOUR, &mut *c).unwrap(), 3600 * RATE);
    let mut b = docked(&mut p, &mut c, 100, T + HOUR);
    assert_eq!(p.claim(&mut a, T + 2 * HOUR, &mut *c).unwrap(), 1800 * RATE);
    assert_eq!(p.claim(&mut b, T + 2 * HOUR, &mut *c).unwrap(), 1800 * RATE);
}

/// A (100) and B (100) docked at T; A gets +100 for 4 h, which snaps up to the boundary at
/// TB + 5 h (boost lasts 4 h 40 min = 16,800 s).
fn boosted_pair() -> (RewardState, Box<Checkpoints>, HarborRewards, HarborRewards) {
    let (mut p, mut c) = setup(T);
    let mut a = docked(&mut p, &mut c, 100, T);
    let b = docked(&mut p, &mut c, 100, T);
    p.deposit(POOL, T, W, &mut *c).unwrap();
    p.grant_boost(&mut a, 100, 4 * HOUR, T, &mut *c).unwrap();
    assert_eq!(a.boost_end_hour, HB + 5);
    assert_eq!(p.total_depth, 300);
    (p, c, a, b)
}
const BOOST_END: i64 = TB + 5 * HOUR;
const BOOSTED_SECS: u64 = (BOOST_END - T) as u64; // 16,800

#[test]
fn boost_ends_on_the_hour_boundary_without_any_transaction() {
    let (mut p, mut c, mut a, mut b) = boosted_pair();
    let mut probe = p.clone();
    let mut probe_c = c.clone();
    probe.accrue(BOOST_END - 1, &mut *probe_c).unwrap();
    assert_eq!(probe.total_depth, 300);
    probe.accrue(BOOST_END, &mut *probe_c).unwrap();
    assert_eq!(probe.total_depth, 200, "boost removed exactly at the boundary");
    assert!(probe_c.get(HB + 5).is_some(), "checkpoint recorded");

    // Nobody touched anything for 10 h. B claims first, then A.
    let t2 = T + 10 * HOUR;
    let after = (t2 - BOOST_END) as u64;
    assert_eq!(p.claim(&mut b, t2, &mut *c).unwrap(), BOOSTED_SECS * RATE / 3 + after * RATE / 2);
    assert_eq!(p.claim(&mut a, t2, &mut *c).unwrap(), BOOSTED_SECS * RATE * 2 / 3 + after * RATE / 2);
    assert_eq!(a.boost_extra, 0);
}

#[test]
fn cancel_exactly_at_the_boundary() {
    let (mut p, mut c, mut a, mut b) = boosted_pair();
    p.cancel_boost(&mut a, BOOST_END, &mut *c).unwrap();
    assert_eq!(a.boost_extra, 0);
    assert_eq!(p.total_depth, 200);
    let t2 = T + 10 * HOUR;
    let after = (t2 - BOOST_END) as u64;
    assert_eq!(p.claim(&mut a, t2, &mut *c).unwrap(), BOOSTED_SECS * RATE * 2 / 3 + after * RATE / 2);
    assert_eq!(p.claim(&mut b, t2, &mut *c).unwrap(), BOOSTED_SECS * RATE / 3 + after * RATE / 2);
}

#[test]
fn early_cancel_ends_the_boost_immediately() {
    let (mut p, mut c, mut a, mut b) = boosted_pair();
    p.cancel_boost(&mut a, T + HOUR, &mut *c).unwrap();
    assert_eq!(p.total_depth, 200);
    assert_eq!(p.boost_amount.iter().sum::<u64>(), 0, "ring entry cleared");
    p.accrue(BOOST_END, &mut *c).unwrap();
    assert_eq!(p.total_depth, 200, "nothing double-subtracted at the old boundary");
    let t2 = T + 10 * HOUR;
    let after = (t2 - T - HOUR) as u64;
    assert_eq!(p.claim(&mut a, t2, &mut *c).unwrap(), 3600 * RATE * 2 / 3 + after * RATE / 2);
    assert_eq!(p.claim(&mut b, t2, &mut *c).unwrap(), 3600 * RATE / 3 + after * RATE / 2);
}

#[test]
fn checkpoint_fallback_after_30_days_credits_base_depth_only() {
    let (mut p, mut c, mut a, mut b) = boosted_pair();
    // Another harbor's boost expires exactly 720 h after A's, overwriting A's checkpoint slot.
    let overwrite_hour = HB + 5 + CHECKPOINT_RING as i64;
    let mut other = HarborRewards::default();
    p.grant_boost(&mut other, 1, 1, overwrite_hour * HOUR - 1_800, &mut *c).unwrap();
    assert_eq!(other.boost_end_hour, overwrite_hour);
    let t2 = overwrite_hour * HOUR;
    p.accrue(t2, &mut *c).unwrap();
    assert!(c.get(HB + 5).is_none(), "A's checkpoint was overwritten");

    let rest = POOL - BOOSTED_SECS * RATE;
    let base_share = BOOSTED_SECS * RATE / 3 + rest / 2;
    assert_eq!(p.claim(&mut a, t2, &mut *c).unwrap(), base_share, "A loses only the boost bonus");
    assert_eq!(p.claim(&mut b, t2, &mut *c).unwrap(), base_share, "B is unaffected");
    // The forfeited boost bonus stays in the vault; it is never paid twice.
    let forfeited = BOOSTED_SECS * RATE / 3;
    assert_eq!(surplus(&p, &c, &[&a, &b, &other], t2), forfeited as i128);
}

#[test]
fn checkpoint_survives_long_idle_if_not_overwritten() {
    let (mut p, mut c, mut a, _b) = boosted_pair();
    let t2 = T + 60 * 24 * HOUR;
    let rest = POOL - BOOSTED_SECS * RATE;
    assert_eq!(p.claim(&mut a, t2, &mut *c).unwrap(), BOOSTED_SECS * RATE * 2 / 3 + rest / 2);
}

#[test]
fn clock_going_backwards_is_ignored() {
    let (mut p, mut c) = setup(T);
    let mut h = docked(&mut p, &mut c, 100, T);
    p.deposit(POOL, T, W, &mut *c).unwrap();
    p.accrue(T + 100, &mut *c).unwrap();
    p.settle(&mut h, T + 50, &mut *c).unwrap();
    assert_eq!(p.last_update, T + 100);
    assert_eq!(h.owed, 100 * RATE);
    p.deposit(POOL, T + 50, W, &mut *c).unwrap();
    assert_eq!(p.stream_end, T + 100 + W, "window anchored at the clamped time");
}

#[test]
fn merge_while_earning_is_continuous() {
    let (mut p, mut c) = setup(T);
    let mut x = HarborRewards::default();
    p.add_depth(&mut x, 100, T, &mut *c).unwrap();
    p.add_depth(&mut x, 100, T, &mut *c).unwrap();
    let mut y = docked(&mut p, &mut c, 200, T);
    p.deposit(POOL, T, W, &mut *c).unwrap();
    // X merges its two subs into one of the same total depth mid-window.
    let mid = T + 5 * HOUR + 17;
    p.remove_depth(&mut x, 100, mid, &mut *c).unwrap();
    p.remove_depth(&mut x, 100, mid, &mut *c).unwrap();
    p.add_depth(&mut x, 200, mid, &mut *c).unwrap();
    let gx = p.claim(&mut x, T + W, &mut *c).unwrap();
    let gy = p.claim(&mut y, T + W, &mut *c).unwrap();
    assert!(gx.abs_diff(gy) <= 2, "x {gx} y {gy}");
}

#[test]
fn boost_rules() {
    let (mut p, mut c) = setup(T);
    let mut a = docked(&mut p, &mut c, 100, T);
    assert!(p.grant_boost(&mut a, 100, 0, T, &mut *c).is_err(), "zero duration");
    assert!(p.grant_boost(&mut a, 0, HOUR, T, &mut *c).is_err(), "zero extra");
    assert!(p.grant_boost(&mut a, 100, 40 * HOUR, T, &mut *c).is_err(), "beyond the ring");
    p.grant_boost(&mut a, 100, HOUR, T, &mut *c).unwrap();
    assert!(p.grant_boost(&mut a, 100, HOUR, T + 60, &mut *c).is_err(), "already active");
    p.grant_boost(&mut a, 50, HOUR, T + 2 * HOUR, &mut *c).unwrap();
    assert_eq!(p.total_depth, 150, "old boost expired, new one active");
}

#[test]
fn extreme_amounts_do_not_overflow() {
    let all_sol: u64 = 600_000_000 * 1_000_000_000; // more than the SOL supply
    for depth in [1u64, 1_000_000_000_000, u64::MAX / 4] {
        let (mut p, mut c) = setup(T);
        let mut h = docked(&mut p, &mut c, depth, T);
        p.deposit(all_sol, T, W, &mut *c).unwrap();
        let got = p.claim(&mut h, T + W, &mut *c).unwrap();
        assert!(all_sol - got <= 1 + depth / ACC_PRECISION as u64, "depth {depth}: got {got}");
    }
    // A single lamport against a huge depth credits nothing and stays in the stream.
    let (mut p, mut c) = setup(T);
    let _h = docked(&mut p, &mut c, u64::MAX / 4, T);
    p.deposit(1, T, W, &mut *c).unwrap();
    p.accrue(T + W, &mut *c).unwrap();
    assert_eq!(p.stream_remaining, 1);
}
