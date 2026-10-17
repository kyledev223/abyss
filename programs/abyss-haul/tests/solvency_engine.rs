//! Property tests for the reward engine (DESIGN.md §13, layer 1).
//!
//! Random operation sequences across several harbors. After every step:
//! - solvency:     deposited − claimed ≥ stream_remaining + Σ(owed + pending)
//! - conservation: total_credited + stream_remaining == total_deposited
//! - no leak:      the solvency surplus is rounding dust only
//! - depth:        total_depth == Σ harbor depth + Σ active boosts
//! - fairness:     each harbor matches an independent pro-rata reference model
//!
//! Case count: PROPTEST_CASES (default 256).

use abyss_haul::rewards::*;
use abyss_haul::state::Checkpoints;
use proptest::prelude::*;

const T0: i64 = 1_760_000_000 + 1_234; // deliberately not on an hour boundary
const WINDOW: i64 = 12 * HOUR;
/// Keep fuzzed timelines inside the 30-day checkpoint ring; the fallback has its own test.
const MAX_ELAPSED: i64 = 29 * 24 * HOUR;

#[derive(Debug, Clone)]
enum Op {
    Deposit(u64),
    TopUp(u64),
    Dock(usize, u64),
    /// Remove `per_mille`/1000 of the harbor's depth.
    Undock(usize, u64),
    Claim(usize),
    Settle(usize),
    Boost(usize, u64, i64),
    Cancel(usize),
    Warp(i64),
}

fn op_strategy(n: usize) -> impl Strategy<Value = Op> {
    prop_oneof![
        3 => prop_oneof![1u64..1_000, 1_000u64..1_000_000_000, 1_000_000_000u64..1_000_000_000_000]
            .prop_map(Op::Deposit),
        1 => (1u64..1_000_000_000_000).prop_map(Op::TopUp),
        3 => (0..n, 1u64..100_000).prop_map(|(h, d)| Op::Dock(h, d)),
        2 => (0..n, 1u64..=1000).prop_map(|(h, f)| Op::Undock(h, f)),
        2 => (0..n).prop_map(Op::Claim),
        1 => (0..n).prop_map(Op::Settle),
        2 => (0..n, 1u64..50_000, 1i64..=12 * HOUR).prop_map(|(h, e, d)| Op::Boost(h, e, d)),
        1 => (0..n).prop_map(Op::Cancel),
        4 => prop_oneof![0i64..60, 60i64..HOUR, HOUR..6 * HOUR, 6 * HOUR..48 * HOUR].prop_map(Op::Warp),
    ]
}

/// Independent model: no accumulator and no rounding. Each released amount is split directly
/// between harbors by effective depth, interval by interval, with boosts ending on their boundary.
#[derive(Clone, Debug)]
struct Reference {
    remaining: f64,
    end: i64,
    last: i64,
    harbors: Vec<RefHarbor>,
}

#[derive(Clone, Debug, Default)]
struct RefHarbor {
    depth: f64,
    boost: f64,
    boost_end: i64,
    earned: f64,
}

impl Reference {
    fn new(n: usize) -> Self {
        Self { remaining: 0.0, end: T0, last: T0, harbors: vec![RefHarbor::default(); n] }
    }

    fn advance(&mut self, now: i64) {
        while self.last < now {
            let next = self
                .harbors
                .iter()
                .filter(|h| h.boost > 0.0 && h.boost_end > self.last)
                .map(|h| h.boost_end)
                .min()
                .map_or(now, |e| e.min(now));
            self.flow(next);
            for h in &mut self.harbors {
                if h.boost > 0.0 && h.boost_end <= next {
                    h.boost = 0.0;
                }
            }
        }
    }

    fn flow(&mut self, t: i64) {
        let total: f64 = self.harbors.iter().map(|h| h.depth + h.boost).sum();
        if total == 0.0 {
            if self.last < self.end {
                self.end += t - self.last;
            }
        } else if self.remaining > 0.0 && self.last < self.end {
            let e = t.min(self.end);
            let released = if e == self.end {
                self.remaining
            } else {
                self.remaining * (e - self.last) as f64 / (self.end - self.last) as f64
            };
            self.remaining -= released;
            for h in &mut self.harbors {
                h.earned += released * (h.depth + h.boost) / total;
            }
        }
        self.last = t;
    }
}

struct World {
    pool: RewardState,
    cps: Box<Checkpoints>,
    harbors: Vec<HarborRewards>,
    claimed: Vec<u64>,
    settles: Vec<u64>,
    now: i64,
    ops: u64,
    reference: Reference,
}

fn fail(op: &Op, e: anchor_lang::error::Error) -> TestCaseError {
    TestCaseError::fail(format!("{op:?} failed: {e:?}"))
}

impl World {
    fn new(n: usize) -> Self {
        Self {
            pool: RewardState::new(T0),
            cps: Box::new(Checkpoints::empty()),
            harbors: vec![HarborRewards::default(); n],
            claimed: vec![0; n],
            settles: vec![0; n],
            now: T0,
            ops: 0,
            reference: Reference::new(n),
        }
    }

    fn apply(&mut self, op: &Op) -> Result<(), TestCaseError> {
        let now = self.now;
        let (pool, cps, r) = (&mut self.pool, &mut *self.cps, &mut self.reference);
        match *op {
            Op::Deposit(amount) => {
                pool.deposit(amount, now, WINDOW, cps).map_err(|e| fail(op, e))?;
                r.advance(now);
                r.remaining += amount as f64;
                r.end = now + WINDOW;
            }
            Op::TopUp(amount) => {
                pool.top_up(amount, now, WINDOW, cps).map_err(|e| fail(op, e))?;
                r.advance(now);
                r.remaining += amount as f64;
                if r.end <= now {
                    r.end = now + WINDOW;
                }
            }
            Op::Dock(i, d) => {
                pool.add_depth(&mut self.harbors[i], d, now, cps).map_err(|e| fail(op, e))?;
                self.settles[i] += 1;
                r.advance(now);
                r.harbors[i].depth += d as f64;
            }
            Op::Undock(i, per_mille) => {
                let amount = self.harbors[i].depth * per_mille / 1000;
                if amount == 0 {
                    return Ok(());
                }
                pool.remove_depth(&mut self.harbors[i], amount, now, cps).map_err(|e| fail(op, e))?;
                self.settles[i] += 1;
                r.advance(now);
                r.harbors[i].depth -= amount as f64;
            }
            Op::Claim(i) => {
                self.claimed[i] += pool.claim(&mut self.harbors[i], now, cps).map_err(|e| fail(op, e))?;
                self.settles[i] += 1;
                r.advance(now);
            }
            Op::Settle(i) => {
                pool.settle(&mut self.harbors[i], now, cps).map_err(|e| fail(op, e))?;
                self.settles[i] += 1;
                r.advance(now);
            }
            Op::Boost(i, extra, duration) => {
                let h = &self.harbors[i];
                if h.boost_extra > 0 && h.boost_end_hour * HOUR > now {
                    return Ok(()); // still active; the engine rejects this (covered in edge-case tests)
                }
                pool.grant_boost(&mut self.harbors[i], extra, duration, now, cps)
                    .map_err(|e| fail(op, e))?;
                self.settles[i] += 1;
                r.advance(now);
                let end = now + duration;
                r.harbors[i].boost = extra as f64;
                r.harbors[i].boost_end = (end + HOUR - 1).div_euclid(HOUR) * HOUR;
            }
            Op::Cancel(i) => {
                pool.cancel_boost(&mut self.harbors[i], now, cps).map_err(|e| fail(op, e))?;
                self.settles[i] += 1;
                r.advance(now);
                r.harbors[i].boost = 0.0;
            }
            Op::Warp(secs) => {
                if now + secs - T0 > MAX_ELAPSED {
                    return Ok(());
                }
                self.now += secs;
            }
        }
        self.ops += 1;
        Ok(())
    }

    fn check(&self) -> Result<(), TestCaseError> {
        let n = self.harbors.len();
        // Preview everyone's pending at `now` on copies, as a claim would compute it.
        let mut pool = self.pool.clone();
        let mut cps = self.cps.clone();
        pool.accrue(self.now, &mut *cps).map_err(|e| TestCaseError::fail(format!("{e:?}")))?;
        let mut owed_total: u128 = 0;
        let mut depth_sum: u64 = 0;
        let mut earned = Vec::with_capacity(n);
        for (i, h) in self.harbors.iter().enumerate() {
            let mut h = h.clone();
            pool.settle(&mut h, self.now, &mut *cps)
                .map_err(|e| TestCaseError::fail(format!("preview settle: {e:?}")))?;
            owed_total += h.owed as u128;
            depth_sum += h.depth + h.boost_extra;
            earned.push(self.claimed[i] as f64 + h.owed as f64);
        }

        prop_assert_eq!(
            pool.total_credited as u128 + pool.stream_remaining as u128,
            pool.total_deposited as u128,
            "conservation"
        );
        prop_assert_eq!(pool.total_claimed, self.claimed.iter().sum::<u64>());

        let vault = (pool.total_deposited - pool.total_claimed) as u128;
        let liabilities = pool.stream_remaining as u128 + owed_total;
        prop_assert!(vault >= liabilities, "INSOLVENT: vault {} < liabilities {}", vault, liabilities);

        // Rounding dust: ≤ 1 lamport per credit (≤ 33 per accrue) and per harbor settle.
        let settles: u64 = self.settles.iter().sum();
        let dust_bound = 34 * self.ops as u128 + settles as u128 + n as u128 + 1;
        prop_assert!(vault - liabilities <= dust_bound, "leak: surplus {} > bound {}", vault - liabilities, dust_bound);

        prop_assert_eq!(pool.total_depth, depth_sum, "total_depth != Σ depth + active boosts");

        let mut r = self.reference.clone();
        r.advance(self.now);
        for i in 0..n {
            let want = r.harbors[i].earned;
            let tol = 2.0 + (self.settles[i] + 2 * self.ops) as f64 + 1e-9 * want;
            prop_assert!(
                (earned[i] - want).abs() <= tol,
                "harbor {} earned {} but reference says {} (tol {})",
                i, earned[i], want, tol
            );
        }
        Ok(())
    }
}

proptest! {
    #[test]
    fn solvency_conservation_and_fairness(
        (n, ops) in (1usize..=6).prop_flat_map(|n| (Just(n), prop::collection::vec(op_strategy(n), 1..300)))
    ) {
        let mut w = World::new(n);
        for op in &ops {
            w.apply(op)?;
            w.check()?;
        }
    }
}
