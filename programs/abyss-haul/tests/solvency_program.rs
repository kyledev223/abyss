//! Solvency property test over real transactions in LiteSVM (DESIGN.md §13, layer 3).
//!
//! Random players mint, dock, undock, claim, fund, reinforce, merge, expand, go on expeditions
//! and wait. Each op is only issued when its preconditions hold (read from chain), so any failed
//! transaction is a test failure. After every op, against actual lamports:
//! - vault − rent == deposited − claimed, and covers stream + Σ(owed + pending)
//! - total_depth == Σ harbor depth + active boosts
//! - Σ harbor.total_claimed == pool.total_claimed; treasury received exactly total_to_treasury
//! - live_subs, active_harbors and each harbor's slot count match the fleet
//!
//! Case count: PROPTEST_CASES (default 32).

mod common;
use common::*;

use abyss_haul::constants::*;
use abyss_haul::state::*;
use anchor_lang::prelude::Pubkey;
use proptest::prelude::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

const PLAYERS: usize = 3;

#[derive(Debug, Clone)]
enum Op {
    Mint { p: usize, roll: u64 },
    Dock { p: usize, k: usize },
    Undock { p: usize, k: usize },
    Claim { p: usize },
    Fund { lamports: u64 },
    Reinforce { p: usize, k: usize },
    Merge { p: usize, k: usize },
    Expand { p: usize },
    ExpeditionStart { p: usize, k: usize, hours: u8 },
    ExpeditionReturn { p: usize, roll: u64 },
    Settle { p: usize },
    Warp { secs: i64 },
}

fn op() -> impl Strategy<Value = Op> {
    let p = 0..PLAYERS;
    prop_oneof![
        4 => (p.clone(), prop_oneof![0u64..5_000, 5_000u64..10_000]).prop_map(|(p, roll)| Op::Mint { p, roll }),
        4 => (p.clone(), any::<usize>()).prop_map(|(p, k)| Op::Dock { p, k }),
        2 => (p.clone(), any::<usize>()).prop_map(|(p, k)| Op::Undock { p, k }),
        3 => p.clone().prop_map(|p| Op::Claim { p }),
        1 => (1u64..50_000_000_000).prop_map(|lamports| Op::Fund { lamports }),
        2 => (p.clone(), any::<usize>()).prop_map(|(p, k)| Op::Reinforce { p, k }),
        2 => (p.clone(), any::<usize>()).prop_map(|(p, k)| Op::Merge { p, k }),
        1 => p.clone().prop_map(|p| Op::Expand { p }),
        2 => (p.clone(), any::<usize>(), 1u8..=6).prop_map(|(p, k, hours)| Op::ExpeditionStart { p, k, hours }),
        3 => (p.clone(), 0u64..10_000).prop_map(|(p, roll)| Op::ExpeditionReturn { p, roll }),
        1 => p.clone().prop_map(|p| Op::Settle { p }),
        4 => prop_oneof![1i64..120, 120i64..HOUR, HOUR..12 * HOUR, 12 * HOUR..48 * HOUR].prop_map(|secs| Op::Warp { secs }),
    ]
}

struct World {
    h: H,
    players: Vec<Keypair>,
    assets: Vec<Vec<Pubkey>>,
    treasury_start: u64,
    keeper: Keypair,
    /// Executed (not skipped) ops by kind; printed with SOLVENCY_STATS=1.
    executed: std::collections::BTreeMap<&'static str, u32>,
}

impl World {
    fn new() -> Self {
        let mut h = H::new();
        let players: Vec<Keypair> = (0..PLAYERS).map(|_| h.player(10_000)).collect();
        for p in &players {
            h.open_harbor(p).unwrap();
        }
        let keeper = h.player(10);
        let treasury_start = h.lamports(&h.treasury);
        Self { h, players, assets: vec![vec![]; PLAYERS], treasury_start, keeper, executed: Default::default() }
    }

    fn pick(&self, p: usize, k: usize, ok: impl Fn(&Sub) -> bool) -> Option<Pubkey> {
        let c: Vec<_> = self.assets[p].iter().filter(|a| ok(&self.h.sub(a))).copied().collect();
        (!c.is_empty()).then(|| c[k % c.len()])
    }

    fn apply(&mut self, op: &Op) -> Result<(), String> {
        let before = self.h.svm.latest_blockhash();
        self.apply_inner(op)?;
        if self.h.svm.latest_blockhash() != before || matches!(op, Op::Warp { .. }) {
            let name = format!("{op:?}");
            let kind = name.split([' ', '{']).next().unwrap().to_string();
            *self.executed.entry(Box::leak(kind.into_boxed_str())).or_default() += 1;
        }
        Ok(())
    }

    fn apply_inner(&mut self, op: &Op) -> Result<(), String> {
        let params = self.h.config().params;
        match *op {
            Op::Mint { p, roll } => {
                let pl = self.players[p].insecure_clone();
                let a = self.h.mint(&pl, roll)?;
                self.assets[p].push(a);
            }
            Op::Dock { p, k } => {
                let harbor = self.h.harbor(&self.players[p].pubkey());
                if harbor.docked >= harbor.slots {
                    return Ok(());
                }
                if let Some(a) = self.pick(p, k, |s| s.state == SubState::Idle) {
                    let pl = self.players[p].insecure_clone();
                    self.h.dock(&pl, &a)?;
                }
            }
            Op::Undock { p, k } => {
                if let Some(a) = self.pick(p, k, |s| s.state == SubState::Docked) {
                    let pl = self.players[p].insecure_clone();
                    self.h.undock(&pl, &a)?;
                }
            }
            Op::Claim { p } => {
                let pl = self.players[p].insecure_clone();
                self.h.claim(&pl)?;
            }
            Op::Fund { lamports } => {
                let k = self.keeper.insecure_clone();
                self.h.svm.airdrop(&k.pubkey(), lamports).unwrap();
                self.h.fund(&k, lamports)?;
            }
            Op::Reinforce { p, k } => {
                let max = params.reinforce_max_level;
                if let Some(a) = self.pick(p, k, |s| matches!(s.state, SubState::Idle | SubState::Docked) && s.level < max) {
                    let pl = self.players[p].insecure_clone();
                    self.h.reinforce(&pl, &a)?;
                }
            }
            Op::Merge { p, k } => {
                let usable: Vec<(Pubkey, u8)> = self.assets[p]
                    .iter()
                    .map(|a| (*a, self.h.sub(a)))
                    .filter(|(_, s)| matches!(s.state, SubState::Idle | SubState::Docked) && (s.tier as usize) < TIERS - 1)
                    .map(|(a, s)| (a, s.tier))
                    .collect();
                let mut pairs = vec![];
                for i in 0..usable.len() {
                    for j in i + 1..usable.len() {
                        if usable[i].1 == usable[j].1 {
                            pairs.push((usable[i].0, usable[j].0));
                        }
                    }
                }
                if let Some(&(a, b)) = pairs.get(k % pairs.len().max(1)) {
                    let pl = self.players[p].insecure_clone();
                    let new = self.h.merge(&pl, &a, &b)?;
                    self.assets[p].retain(|x| *x != a && *x != b);
                    self.assets[p].push(new);
                }
            }
            Op::Expand { p } => {
                if self.h.harbor(&self.players[p].pubkey()).slots < params.harbor_max_slots {
                    let pl = self.players[p].insecure_clone();
                    self.h.expand(&pl)?;
                }
            }
            Op::ExpeditionStart { p, k, hours } => {
                let harbor = self.h.harbor(&self.players[p].pubkey());
                let cooled = harbor.last_expedition_return == 0
                    || self.h.now() >= harbor.last_expedition_return + EXPEDITION_COOLDOWN;
                if harbor.expedition_sub != Pubkey::default() || !cooled {
                    return Ok(());
                }
                if let Some(a) = self.pick(p, k, |s| s.state == SubState::Docked) {
                    let pl = self.players[p].insecure_clone();
                    self.h.expedition_start(&pl, &a, hours)?;
                }
            }
            Op::ExpeditionReturn { p, roll } => {
                if let Some(a) = self.pick(p, 0, |s| s.state == SubState::Away) {
                    // Wait until the sub is due back, as a player would.
                    let wait = self.h.sub(&a).away_until - self.h.now();
                    if wait > 0 {
                        self.h.warp(wait);
                    }
                    let pl = self.players[p].insecure_clone();
                    self.h.expedition_return(&pl, &a, roll)?;
                }
            }
            Op::Settle { p } => {
                let k = self.keeper.insecure_clone();
                let owner = self.players[p].pubkey();
                self.h.settle(&k, &owner)?;
            }
            Op::Warp { secs } => self.h.warp(secs),
        }
        Ok(())
    }

    fn check(&self) {
        let owners: Vec<Pubkey> = self.players.iter().map(|p| p.pubkey()).collect();
        self.h.assert_solvent(&owners);

        let pool = self.h.pool();
        let harbors: Vec<Harbor> = owners.iter().map(|o| self.h.harbor(o)).collect();
        assert_eq!(harbors.iter().map(|h| h.total_claimed).sum::<u64>(), pool.rewards.total_claimed);
        assert_eq!(self.h.lamports(&self.h.treasury) - self.treasury_start, pool.total_to_treasury);
        assert_eq!(pool.live_subs as usize, self.assets.iter().map(Vec::len).sum::<usize>());
        assert_eq!(pool.pending_mints, 0);
        assert_eq!(pool.active_harbors as usize, harbors.iter().filter(|h| h.rewards.depth > 0).count());
        for (p, harbor) in harbors.iter().enumerate() {
            let in_slots = self.assets[p].iter().filter(|a| self.h.sub(a).state != SubState::Idle).count();
            assert_eq!(harbor.docked as usize, in_slots, "harbor {p} slot count");
            let docked_depth: u64 = self.assets[p]
                .iter()
                .map(|a| self.h.sub(a))
                .filter(|s| s.state == SubState::Docked)
                .map(|s| s.depth)
                .sum();
            assert_eq!(harbor.rewards.depth, docked_depth, "harbor {p} depth");
            for a in &self.assets[p] {
                assert_eq!(self.h.core_owner(a), Some(owners[p]), "asset owner");
            }
        }
    }
}

fn cases() -> u32 {
    std::env::var("PROPTEST_CASES").ok().and_then(|v| v.parse().ok()).unwrap_or(32)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(cases()))]
    #[test]
    fn vault_stays_solvent_through_real_transactions(ops in prop::collection::vec(op(), 1..120)) {
        let mut w = World::new();
        for op in &ops {
            if let Err(e) = w.apply(op) {
                return Err(TestCaseError::fail(format!("{op:?} failed:\n{e}")));
            }
            w.check();
        }
        if std::env::var("SOLVENCY_STATS").is_ok() {
            eprintln!("executed: {:?}", w.executed);
        }
    }
}
