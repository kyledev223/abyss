//! Compute-unit usage per instruction, measured in LiteSVM with the real Core program.
//! The client sets its compute-unit limit from these numbers (DESIGN.md §10); this test fails if
//! any instruction grows past the budget below. Run with --nocapture to print the table.

mod common;
use common::*;

/// Ceiling per instruction; clients request measured usage × 1.3, capped here.
const BUDGET: u64 = 400_000;

#[test]
fn every_instruction_fits_the_budget() {
    let mut h = H::new();
    let alice = h.player(100);
    let funder = h.player(100);
    let mut rows: Vec<(&str, u64)> = vec![];
    macro_rules! measure {
        ($name:expr, $call:expr) => {{
            let out = $call;
            rows.push(($name, h.last_cu));
            out
        }};
    }

    measure!("open_harbor", h.open_harbor(&alice)).unwrap();
    let r = h.fresh_randomness();
    measure!("mint_commit", h.mint_commit(&alice, r)).unwrap();
    h.reveal(r, value_for_roll(0, 0));
    measure!("mint_reveal", h.mint_reveal(&alice, 0)).unwrap();
    let a = asset_pda(0);
    let b = h.mint(&alice, 0).unwrap();
    measure!("dock", h.dock(&alice, &a)).unwrap();
    h.dock(&alice, &b).unwrap();
    measure!("fund_pool", h.fund(&funder, 10 * SOL)).unwrap();
    h.warp(HOUR);
    measure!("claim", h.claim(&alice)).unwrap();
    measure!("settle", h.settle(&funder, &alice.pubkey_for_test())).unwrap();
    measure!("crank", h.crank(&funder)).unwrap();
    measure!("reinforce", h.reinforce(&alice, &a)).unwrap();
    measure!("expand_harbor", h.expand(&alice)).unwrap();
    measure!("expedition_start", h.expedition_start(&alice, &a, 1)).unwrap();
    h.warp(HOUR);
    let r = h.fresh_randomness();
    measure!("expedition_return_commit", h.expedition_commit(&alice, &a, r)).unwrap();
    h.reveal(r, value_for_roll(100, 0)); // boost
    measure!("expedition_return_reveal", h.expedition_reveal(&alice, &a)).unwrap();
    measure!("undock", h.undock(&alice, &a)).unwrap();
    h.dock(&alice, &a).unwrap();
    measure!("merge (both docked)", h.merge(&alice, &a, &b)).unwrap();
    // Worst case for accrue: many boost boundaries crossed in one call is bounded by the 32-slot ring.

    println!("\n{:<28} {:>9}", "instruction", "CU");
    for (name, cu) in &rows {
        println!("{name:<28} {cu:>9}");
    }
    for (name, cu) in rows {
        assert!(cu < BUDGET, "{name} used {cu} CU");
    }
}

trait TestPubkey {
    fn pubkey_for_test(&self) -> anchor_lang::prelude::Pubkey;
}
impl TestPubkey for solana_keypair::Keypair {
    fn pubkey_for_test(&self) -> anchor_lang::prelude::Pubkey {
        solana_signer::Signer::pubkey(self)
    }
}
