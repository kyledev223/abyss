//! Instruction-level tests in LiteSVM with the real Metaplex Core program (DESIGN.md §13, layer 3).

mod common;
use common::*;

use abyss_haul::constants::*;
use abyss_haul::economics::{grow, reinforce_cost};
use abyss_haul::state::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

// Rolls (first 8 bytes of the randomness mod 10000) at launch odds.
const RUST_BUCKET: u64 = 0;
const REEF_RUNNER: u64 = 6_000;
const ABYSSAL: u64 = 9_990;
// Expedition rolls: < 4500 boost, < 7000 barnacle, else nothing.
const FIND_BOOST: u64 = 100;
const FIND_BARNACLE: u64 = 5_000;
const FIND_NOTHING: u64 = 9_000;

const TX_FEE: u64 = 5_000;

fn docked_player(h: &mut H, rolls: &[u64]) -> (Keypair, Vec<anchor_lang::prelude::Pubkey>) {
    let p = h.player(50);
    h.open_harbor(&p).unwrap();
    let assets: Vec<_> = rolls.iter().map(|r| h.mint(&p, *r).unwrap()).collect();
    for a in &assets {
        h.dock(&p, a).unwrap();
    }
    (p, assets)
}

// ------------------------------------------------------------------ setup and admin

#[test]
fn initialize_sets_up_config_pool_and_collection() {
    let h = H::new();
    let c = h.config();
    assert_eq!(c.admin, h.admin.pubkey());
    assert_eq!(c.treasury, h.treasury);
    assert_eq!(c.params, launch_params());
    assert_eq!(c.collection, h.collection);
    assert_eq!(c.checkpoints, h.checkpoints);
    assert!(!c.paused_mint && !c.paused_upgrades);
    let collection = h.svm.get_account(&h.collection).unwrap();
    assert_eq!(collection.owner, MPL_CORE_ID);
    assert_eq!(collection.data[0], 5, "Core CollectionV1");
    assert_eq!(&collection.data[1..33], authority_pda().as_ref(), "our PDA is update authority");
    h.assert_solvent(&[]);
}

#[test]
fn only_the_upgrade_authority_can_initialize() {
    let mut h = H::boot();
    let intruder = h.player(10);
    assert_err(h.initialize(&intruder, launch_params()), "NotUpgradeAuthority");
    let deployer = h.deployer.insecure_clone();
    h.initialize(&deployer, launch_params()).unwrap();
    assert!(h.initialize(&deployer, launch_params()).is_err(), "cannot initialize twice");
}

#[test]
fn config_changes_are_admin_only_and_bounded() {
    let mut h = H::new();
    let admin = h.admin.insecure_clone();
    let mallory = h.player(10);
    assert_err(h.set_pause(&mallory, true, true), "NotAdmin");
    assert_err(h.update_config(&mallory, launch_params()), "NotAdmin");

    for bad in [
        { let mut p = launch_params(); p.pool_bps = 4_000; p },
        { let mut p = launch_params(); p.tier_odds_bps[0] += 1; p },
        { let mut p = launch_params(); p.window = 60; p },
        { let mut p = launch_params(); p.tier_depth[5] = 1; p },
        { let mut p = launch_params(); p.expedition_boost_hours_per_hour = 3; p }, // 18 h boosts
    ] {
        assert_err(h.update_config(&admin, bad), "InvalidParams");
    }
    let mut ok = launch_params();
    ok.mint_price = 300_000_000;
    h.update_config(&admin, ok.clone()).unwrap();
    assert_eq!(h.config().params, ok);
}

#[test]
fn admin_handover_is_two_step() {
    let mut h = H::new();
    let admin = h.admin.insecure_clone();
    let squads = h.player(10);
    let mallory = h.player(10);
    h.propose_admin(&admin, squads.pubkey()).unwrap();
    assert_err(h.accept_admin(&mallory), "NotPendingAdmin");
    assert_eq!(h.config().admin, admin.pubkey(), "nothing changes until accepted");
    h.accept_admin(&squads).unwrap();
    assert_eq!(h.config().admin, squads.pubkey());
    assert_err(h.set_pause(&admin, true, false), "NotAdmin");
    h.set_pause(&squads, true, false).unwrap();
}

// ------------------------------------------------------------------ minting

#[test]
fn mint_splits_the_fee_and_creates_the_asset() {
    let mut h = H::new();
    let alice = h.player(10);
    let treasury_before = h.lamports(&h.treasury);
    let asset = h.mint(&alice, ABYSSAL).unwrap();

    let price = launch_params().mint_price;
    let to_pool = price * 7 / 10;
    assert_eq!(h.lamports(&vault_pda()) - h.vault_rent_min(), to_pool);
    assert_eq!(h.lamports(&h.treasury) - treasury_before, price - to_pool);
    assert_eq!(h.core_owner(&asset), Some(alice.pubkey()));
    let sub = h.sub(&asset);
    assert_eq!((sub.tier, sub.depth, sub.state), (5, 5_000, SubState::Idle));
    let pool = h.pool();
    assert_eq!((pool.live_subs, pool.pending_mints, pool.minted_count), (1, 0, 1));
    assert!(h.fetch::<PendingMint>(&pending_pda(0)).is_none(), "pending mint closed");
    h.assert_solvent(&[alice.pubkey()]);
}

#[test]
fn tier_follows_the_roll() {
    let mut h = H::new();
    let p = h.player(20);
    for (roll, tier) in [(0, 0), (4_999, 0), (5_000, 1), (7_499, 1), (7_500, 2), (8_800, 3), (9_600, 4), (9_949, 4), (9_950, 5), (9_999, 5)] {
        let asset = h.mint(&p, roll).unwrap();
        assert_eq!(h.sub(&asset).tier, tier, "roll {roll}");
    }
}

#[test]
fn commit_requires_fresh_switchboard_randomness() {
    let mut h = H::new();
    let alice = h.player(10);
    let slot = h.slot();

    let stale = anchor_lang::prelude::Pubkey::new_unique();
    h.write_randomness(stale, slot - 2, 0, [0; 32]);
    assert_err(h.mint_commit(&alice, stale), "RandomnessNotFresh");

    let revealed = anchor_lang::prelude::Pubkey::new_unique();
    let slot = h.slot();
    h.write_randomness(revealed, slot - 1, slot, value_for_roll(ABYSSAL, 0));
    assert_err(h.mint_commit(&alice, revealed), "RandomnessNotFresh");

    // Not owned by Switchboard: a player cannot forge their own "randomness".
    let forged = h.player(1).pubkey();
    assert_err(h.mint_commit(&alice, forged), "InvalidRandomness");
}

#[test]
fn reveal_is_permissionless_and_reimburses_the_caller() {
    let mut h = H::new();
    let alice = h.player(10);
    let bob = h.player(10);
    let (alice_before, bob_before) = (h.lamports(&alice.pubkey()), h.lamports(&bob.pubkey()));

    let r = h.fresh_randomness();
    h.mint_commit(&alice, r).unwrap();
    h.reveal(r, value_for_roll(REEF_RUNNER, 0));
    h.mint_reveal(&bob, 0).unwrap();

    let asset = asset_pda(0);
    assert_eq!(h.core_owner(&asset), Some(alice.pubkey()), "asset goes to the minter, not the caller");
    assert_eq!(h.lamports(&bob.pubkey()), bob_before - TX_FEE, "caller is reimbursed exactly");
    let rent = h.lamports(&asset) + h.lamports(&sub_pda(&asset));
    assert_eq!(
        alice_before - h.lamports(&alice.pubkey()),
        launch_params().mint_price + rent + TX_FEE,
        "minter pays price + rent; the rest of the deposit is refunded"
    );
}

#[test]
fn unrevealed_mint_falls_back_to_the_lowest_tier_after_the_timeout() {
    let mut h = H::new();
    let alice = h.player(10);
    let r = h.fresh_randomness();
    h.mint_commit(&alice, r).unwrap();
    assert_err(h.mint_reveal(&alice, 0), "RandomnessNotRevealed");
    h.warp(REVEAL_TIMEOUT);
    h.mint_reveal(&alice, 0).unwrap();
    assert_eq!(h.sub(&asset_pda(0)).tier, 0);
}

#[test]
fn recommitting_the_randomness_cannot_reroll_a_mint() {
    let mut h = H::new();
    let alice = h.player(10);
    let r = h.fresh_randomness();
    h.mint_commit(&alice, r).unwrap();
    // Alice dislikes the outcome she sees coming, re-commits her randomness account and gets a
    // great value revealed on the new seed.
    h.warp(5);
    let slot = h.slot();
    h.write_randomness(r, slot - 1, slot, value_for_roll(ABYSSAL, 0));
    assert_err(h.mint_reveal(&alice, 0), "RandomnessNotRevealed");
    h.warp(REVEAL_TIMEOUT);
    h.mint_reveal(&alice, 0).unwrap();
    assert_eq!(h.sub(&asset_pda(0)).tier, 0, "tampering only ever leads to the worst outcome");
}

#[test]
fn live_supply_cap_counts_pending_mints_and_merges_free_room() {
    let mut p = launch_params();
    p.max_live_subs = 2;
    let mut h = H::with_params(p);
    let alice = h.player(20);
    let a = h.mint(&alice, RUST_BUCKET).unwrap();
    let r = h.fresh_randomness();
    h.mint_commit(&alice, r).unwrap(); // pending counts toward the cap
    let r2 = h.fresh_randomness();
    assert_err(h.mint_commit(&alice, r2), "SupplyCapReached");
    h.reveal(r, value_for_roll(RUST_BUCKET, 0));
    h.mint_reveal(&alice, 1).unwrap();
    h.open_harbor(&alice).unwrap();
    h.merge(&alice, &a, &asset_pda(1)).unwrap();
    assert_eq!(h.pool().live_subs, 1);
    h.mint(&alice, RUST_BUCKET).unwrap();
}

// ------------------------------------------------------------------ harbor

#[test]
fn docked_subs_are_frozen_in_the_wallet() {
    let mut h = H::new();
    let (alice, assets) = docked_player(&mut h, &[RUST_BUCKET]);
    let bob = h.player(10);
    let a = assets[0];
    assert!(h.core_transfer(&alice, &a, &bob.pubkey()).is_err(), "docked sub cannot be transferred");
    assert_eq!(h.core_owner(&a), Some(alice.pubkey()));
    h.undock(&alice, &a).unwrap();
    h.core_transfer(&alice, &a, &bob.pubkey()).unwrap();
    assert_eq!(h.core_owner(&a), Some(bob.pubkey()));

    // Stats follow the NFT; the old owner can no longer dock it, the new one can.
    assert_err(h.dock(&alice, &a), "NotOwner");
    h.open_harbor(&bob).unwrap();
    h.dock(&bob, &a).unwrap();
    assert_eq!(h.harbor(&bob.pubkey()).rewards.depth, 100);
    h.assert_solvent(&[alice.pubkey(), bob.pubkey()]);
}

#[test]
fn nobody_else_can_dock_or_undock_your_sub() {
    let mut h = H::new();
    let alice = h.player(10);
    let a = h.mint(&alice, RUST_BUCKET).unwrap();
    let mallory = h.player(10);
    h.open_harbor(&mallory).unwrap();
    assert_err(h.dock(&mallory, &a), "NotOwner");
    h.open_harbor(&alice).unwrap();
    h.dock(&alice, &a).unwrap();
    assert_err(h.undock(&mallory, &a), "WrongSubState");
}

#[test]
fn harbor_slots_are_enforced_and_expandable() {
    let mut h = H::new();
    let (alice, _) = docked_player(&mut h, &[0, 0, 0, 0]);
    let extra = h.mint(&alice, RUST_BUCKET).unwrap();
    assert_err(h.dock(&alice, &extra), "HarborFull");

    let vault_before = h.lamports(&vault_pda());
    h.expand(&alice).unwrap();
    let cost = launch_params().slot_base_lamports;
    assert_eq!(h.lamports(&vault_pda()) - vault_before, cost * 7 / 10);
    assert_eq!(h.harbor(&alice.pubkey()).slots, 5);
    h.dock(&alice, &extra).unwrap();

    let next = grow(cost, launch_params().slot_growth_bps, 1).unwrap();
    let vault_before = h.lamports(&vault_pda());
    h.expand(&alice).unwrap();
    assert_eq!(h.lamports(&vault_pda()) - vault_before, (next as u128 * 7_000).div_ceil(10_000) as u64);
    h.assert_solvent(&[alice.pubkey()]);
}

#[test]
fn rewards_split_by_depth_and_claims_match_the_vault() {
    let mut h = H::new();
    let (alice, _) = docked_player(&mut h, &[RUST_BUCKET]); // 100
    let (bob, _) = docked_player(&mut h, &[RUST_BUCKET, RUST_BUCKET, RUST_BUCKET]); // 300
    h.warp(13 * HOUR); // drain the mint fees
    h.claim(&alice).unwrap();
    h.claim(&bob).unwrap();

    let funder = h.player(100);
    h.fund(&funder, 40 * SOL).unwrap();
    h.warp(13 * HOUR);
    let a = h.claim(&alice).unwrap();
    let b = h.claim(&bob).unwrap();
    assert!(a.abs_diff(10 * SOL) <= 2 && b.abs_diff(30 * SOL) <= 2, "a {a} b {b}");
    assert_eq!(h.claim(&alice).unwrap(), 0, "nothing left to claim");
    h.assert_solvent(&[alice.pubkey(), bob.pubkey()]);
}

// ------------------------------------------------------------------ upgrades

#[test]
fn reinforce_charges_the_formula_and_raises_depth() {
    let mut h = H::new();
    let (alice, assets) = docked_player(&mut h, &[RUST_BUCKET]);
    let a = assets[0];
    let p = launch_params();
    for level in 1..=p.reinforce_max_level {
        let fee = reinforce_cost(&p, 100, level).unwrap();
        let (vault_before, treasury_before) = (h.lamports(&vault_pda()), h.lamports(&h.treasury));
        h.reinforce(&alice, &a).unwrap();
        let to_pool = h.lamports(&vault_pda()) - vault_before;
        assert_eq!(to_pool + h.lamports(&h.treasury) - treasury_before, fee, "level {level}");
        let depth = 100 * (10_000 + level as u64 * 800) / 10_000;
        assert_eq!(h.sub(&a).depth, depth);
        assert_eq!(h.harbor(&alice.pubkey()).rewards.depth, depth);
    }
    assert_eq!(reinforce_cost(&p, 100, 1).unwrap(), 20_000_000, "0.02 SOL for a Rust Bucket");
    assert_err(h.reinforce(&alice, &a), "MaxLevel");
    h.assert_solvent(&[alice.pubkey()]);
}

#[test]
fn reinforce_works_on_idle_subs_only_for_their_owner() {
    let mut h = H::new();
    let alice = h.player(10);
    let a = h.mint(&alice, RUST_BUCKET).unwrap();
    h.open_harbor(&alice).unwrap();
    h.reinforce(&alice, &a).unwrap();
    assert_eq!(h.sub(&a).depth, 108);
    let mallory = h.player(10);
    h.open_harbor(&mallory).unwrap();
    assert_err(h.reinforce(&mallory, &a), "NotOwner");
}

#[test]
fn merge_burns_two_and_docks_the_result() {
    let mut h = H::new();
    let (alice, assets) = docked_player(&mut h, &[RUST_BUCKET, RUST_BUCKET]);
    h.warp(HOUR);
    let owed_before = {
        h.settle(&alice, &alice.pubkey()).unwrap();
        h.harbor(&alice.pubkey()).rewards.owed
    };
    let new = h.merge(&alice, &assets[0], &assets[1]).unwrap();

    for old in &assets {
        assert_eq!(h.core_owner(old), None, "burned");
        assert!(h.fetch::<Sub>(&sub_pda(old)).is_none(), "stats account closed");
    }
    assert_eq!(h.core_owner(&new), Some(alice.pubkey()));
    let sub = h.sub(&new);
    assert_eq!((sub.tier, sub.depth, sub.state), (1, 220, SubState::Docked));
    let harbor = h.harbor(&alice.pubkey());
    assert_eq!((harbor.docked, harbor.rewards.depth), (1, 220), "one slot freed");
    assert!(harbor.rewards.owed >= owed_before, "earnings before the merge are kept");
    assert_eq!(h.pool().live_subs, 1);
    let carol = h.player(1).pubkey();
    assert!(h.core_transfer(&alice, &new, &carol).is_err(), "new sub is frozen");
    h.assert_solvent(&[alice.pubkey()]);
}

#[test]
fn merge_rejects_bad_pairs() {
    let mut h = H::new();
    let (alice, assets) = docked_player(&mut h, &[RUST_BUCKET, REEF_RUNNER, ABYSSAL, ABYSSAL]);
    assert_err(h.merge(&alice, &assets[0], &assets[1]).map(|_| ()), "InvalidMerge");
    assert_err(h.merge(&alice, &assets[2], &assets[3]).map(|_| ()), "InvalidMerge"); // top tier
    assert!(h.merge(&alice, &assets[0], &assets[0]).is_err(), "same sub twice");
}

// ------------------------------------------------------------------ pause matrix

#[test]
fn pause_stops_growth_but_never_claims_undock_or_returns() {
    let mut h = H::new();
    let (alice, assets) = docked_player(&mut h, &[RUST_BUCKET, RUST_BUCKET, RUST_BUCKET]);
    let idle = h.mint(&alice, RUST_BUCKET).unwrap();
    h.expedition_start(&alice, &assets[2], 1).unwrap();
    let admin = h.admin.insecure_clone();
    h.set_pause(&admin, true, true).unwrap();

    let r = h.fresh_randomness();
    assert_err(h.mint_commit(&alice, r), "MintPaused");
    assert_err(h.dock(&alice, &idle), "UpgradesPaused");
    assert_err(h.reinforce(&alice, &assets[0]), "UpgradesPaused");
    assert_err(h.expand(&alice), "UpgradesPaused");
    assert_err(h.merge(&alice, &assets[0], &assets[1]).map(|_| ()), "UpgradesPaused");
    assert_err(h.expedition_start(&alice, &assets[0], 1), "UpgradesPaused");

    h.warp(HOUR);
    h.claim(&alice).unwrap();
    h.undock(&alice, &assets[0]).unwrap();
    h.expedition_return(&alice, &assets[2], FIND_NOTHING).unwrap();
    h.assert_solvent(&[alice.pubkey()]);
}

// ------------------------------------------------------------------ expeditions

#[test]
fn expedition_cycle_with_a_boost() {
    let mut h = H::new();
    let (alice, assets) = docked_player(&mut h, &[RUST_BUCKET, RUST_BUCKET]);
    let a = assets[0];
    h.expedition_start(&alice, &a, 3).unwrap();
    assert_eq!(h.harbor(&alice.pubkey()).rewards.depth, 100, "away sub earns nothing");
    assert_eq!(h.sub(&a).state, SubState::Away);
    assert_err(h.undock(&alice, &a), "WrongSubState");

    let r = h.fresh_randomness();
    assert_err(h.expedition_commit(&alice, &a, r), "StillAway");
    h.warp(3 * HOUR);
    h.expedition_return(&alice, &a, FIND_BOOST).unwrap();

    let harbor = h.harbor(&alice.pubkey());
    assert_eq!(h.sub(&a).state, SubState::Docked);
    assert_eq!(harbor.rewards.depth, 200);
    assert_eq!(harbor.rewards.boost_extra, 100, "+100% of the sub's depth");
    let end = harbor.rewards.boost_end_hour * HOUR;
    assert!(end >= h.now() + 6 * HOUR && end < h.now() + 7 * HOUR, "3 h away → 6 h boost, snapped up");
    assert_eq!(harbor.boost_sub, sub_pda(&a));
    assert_eq!(h.pool().rewards.total_depth, 300);
    h.assert_solvent(&[alice.pubkey()]);

    // The boost expires on its hour boundary with no transaction; a keeper settle clears it.
    h.warp(7 * HOUR);
    let keeper = h.player(1);
    h.settle(&keeper, &alice.pubkey()).unwrap();
    let harbor = h.harbor(&alice.pubkey());
    assert_eq!((harbor.rewards.boost_extra, harbor.boost_sub), (0, Default::default()));
    assert_eq!(h.pool().rewards.total_depth, 200);

    assert_err(h.expedition_start(&alice, &a, 1), "ExpeditionCooldown");
    h.warp(24 * HOUR);
    h.expedition_start(&alice, &a, 1).unwrap();
    h.assert_solvent(&[alice.pubkey()]);
}

#[test]
fn expedition_barnacle_nothing_and_fallback() {
    let mut h = H::new();
    let (alice, assets) = docked_player(&mut h, &[RUST_BUCKET]);
    let a = assets[0];

    h.expedition_start(&alice, &a, 1).unwrap();
    h.warp(HOUR);
    h.expedition_return(&alice, &a, FIND_BARNACLE).unwrap();
    assert_eq!(h.sub(&a).barnacles, 1 << 3);

    h.warp(24 * HOUR);
    h.expedition_start(&alice, &a, 1).unwrap();
    h.warp(HOUR);
    h.expedition_return(&alice, &a, FIND_NOTHING).unwrap();
    assert_eq!(h.harbor(&alice.pubkey()).rewards.boost_extra, 0);

    // Oracle never reveals: after the timeout anyone can bring the sub home with no find.
    h.warp(24 * HOUR);
    h.expedition_start(&alice, &a, 1).unwrap();
    h.warp(HOUR);
    let r = h.fresh_randomness();
    h.expedition_commit(&alice, &a, r).unwrap();
    let keeper = h.player(1);
    assert_err(h.expedition_reveal(&keeper, &a), "RandomnessNotRevealed");
    h.warp(REVEAL_TIMEOUT);
    h.expedition_reveal(&keeper, &a).unwrap();
    assert_eq!(h.sub(&a).state, SubState::Docked);
    assert_eq!(h.harbor(&alice.pubkey()).rewards.depth, 100);
    h.assert_solvent(&[alice.pubkey()]);
}

#[test]
fn undocking_or_merging_the_boosted_sub_cancels_the_boost() {
    let mut h = H::new();
    let (alice, assets) = docked_player(&mut h, &[RUST_BUCKET, RUST_BUCKET, RUST_BUCKET]);
    h.expedition_start(&alice, &assets[0], 2).unwrap();
    h.warp(2 * HOUR);
    h.expedition_return(&alice, &assets[0], FIND_BOOST).unwrap();
    assert_eq!(h.pool().rewards.total_depth, 400);
    h.undock(&alice, &assets[0]).unwrap();
    let harbor = h.harbor(&alice.pubkey());
    assert_eq!((harbor.rewards.boost_extra, harbor.rewards.depth), (0, 200));
    assert_eq!(h.pool().rewards.total_depth, 200);
    h.warp(10 * HOUR);
    h.crank(&alice).unwrap(); // the old boundary passes without double-subtracting
    assert_eq!(h.pool().rewards.total_depth, 200);

    h.warp(24 * HOUR);
    h.expedition_start(&alice, &assets[1], 1).unwrap();
    h.warp(HOUR);
    h.expedition_return(&alice, &assets[1], FIND_BOOST).unwrap();
    h.merge(&alice, &assets[1], &assets[2]).unwrap();
    let harbor = h.harbor(&alice.pubkey());
    assert_eq!((harbor.rewards.boost_extra, harbor.rewards.depth), (0, 220));
    assert_eq!(h.pool().rewards.total_depth, 220);
    h.assert_solvent(&[alice.pubkey()]);
}
