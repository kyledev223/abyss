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
fn commit_creates_a_real_orao_request() {
    let mut h = H::new();
    let alice = h.player(10);
    let nonce = random_nonce();
    let request = h.mint_request(&alice.pubkey(), &nonce);
    let orao_treasury_before = h.lamports(&vrf_treasury());
    h.mint_commit(&alice, nonce).unwrap();
    let acc = h.svm.get_account(&request).unwrap();
    assert_eq!(acc.owner, abyss_haul::ORAO_VRF_ID);
    assert_eq!(acc.data[8], 0, "pending until ORAO's authorities fulfil it");
    assert_eq!(h.lamports(&vrf_treasury()) - orao_treasury_before, ORAO_FEE);
    let pending: PendingMint = h.fetch(&pending_pda(0)).unwrap();
    assert_eq!(pending.randomness, request);
}

#[test]
fn a_pre_requested_seed_cannot_block_or_steer_a_mint() {
    let mut h = H::new();
    let alice = h.player(10);
    let mallory = h.player(10);
    // Mallory requests (and could have seen fulfilled) the seed Alice is about to use.
    let nonce = random_nonce();
    let seed = abyss_haul::external::orao::mint_seed(0, &alice.pubkey(), &nonce);
    h.orao_request(&mallory, seed).unwrap();
    assert!(h.mint_commit(&alice, nonce).is_err(), "a seed can only be requested once");
    // But she can't predict Alice's real nonce, so a fresh one goes straight through.
    h.mint_commit(&alice, random_nonce()).unwrap();
}

#[test]
fn reveal_is_permissionless_and_reimburses_the_caller() {
    let mut h = H::new();
    let alice = h.player(10);
    let bob = h.player(10);
    let (alice_before, bob_before) = (h.lamports(&alice.pubkey()), h.lamports(&bob.pubkey()));

    let nonce = random_nonce();
    let request = h.mint_request(&alice.pubkey(), &nonce);
    h.mint_commit(&alice, nonce).unwrap();
    h.fulfill(request, value_for_roll(REEF_RUNNER, 0));
    h.mint_reveal(&bob, 0).unwrap();

    let asset = asset_pda(0);
    assert_eq!(h.core_owner(&asset), Some(alice.pubkey()), "asset goes to the minter, not the caller");
    assert_eq!(h.sub(&asset).tier, 1);
    assert_eq!(h.lamports(&bob.pubkey()), bob_before - TX_FEE, "caller is reimbursed exactly");
    let rent = h.lamports(&asset) + h.lamports(&sub_pda(&asset));
    assert_eq!(
        alice_before - h.lamports(&alice.pubkey()),
        launch_params().mint_price + rent + h.lamports(&request) + ORAO_FEE + TX_FEE,
        "minter pays price + rent + ORAO fee and request rent; the rest of the deposit is refunded"
    );
}

#[test]
fn unfulfilled_mint_falls_back_to_the_lowest_tier_after_the_timeout() {
    let mut h = H::new();
    let alice = h.player(10);
    h.mint_commit(&alice, random_nonce()).unwrap();
    assert_err(h.mint_reveal(&alice, 0), "RandomnessNotRevealed");
    h.warp(REVEAL_TIMEOUT);
    h.mint_reveal(&alice, 0).unwrap();
    assert_eq!(h.sub(&asset_pda(0)).tier, 0);
}

#[test]
fn a_forged_fulfilment_is_ignored() {
    let mut h = H::new();
    let alice = h.player(10);
    let nonce = random_nonce();
    let request = h.mint_request(&alice.pubkey(), &nonce);
    h.mint_commit(&alice, nonce).unwrap();
    // The request account claims to be fulfilled with a great roll, but for a different seed.
    h.write_fulfilled(request, [7; 32], value_for_roll(ABYSSAL, 0));
    assert_err(h.mint_reveal(&alice, 0), "RandomnessNotRevealed");
    h.warp(REVEAL_TIMEOUT);
    h.mint_reveal(&alice, 0).unwrap();
    assert_eq!(h.sub(&asset_pda(0)).tier, 0, "tampering only ever leads to the worst outcome");
}

#[test]
fn commit_rejects_a_fake_orao_network_state() {
    let mut h = H::new();
    let alice = h.player(10);
    let nonce = random_nonce();
    let index = h.pool().minted_count;
    let fake = h.player(1).pubkey();
    let mut ix_accounts = abyss_haul::accounts::MintCommit {
        payer: alice.pubkey(),
        config: config_pda(),
        pool: pool_pda(),
        vault: vault_pda(),
        treasury: h.treasury,
        checkpoints: h.checkpoints,
        vrf_network_state: fake,
        vrf_treasury: vrf_treasury(),
        vrf_request: h.mint_request(&alice.pubkey(), &nonce),
        vrf_program: abyss_haul::ORAO_VRF_ID,
        pending: pending_pda(index),
        system_program: anchor_lang::system_program::ID,
        event_authority: event_authority(),
        program: abyss_haul::ID,
    };
    let send = |h: &mut H, accounts: &abyss_haul::accounts::MintCommit| {
        use anchor_lang::{InstructionData, ToAccountMetas};
        let ix = anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
            abyss_haul::ID,
            &abyss_haul::instruction::MintCommit { nonce }.data(),
            accounts.to_account_metas(None),
        );
        h.send(&[ix], &[&alice])
    };
    assert_err(send(&mut h, &ix_accounts), "ConstraintSeeds");
    ix_accounts.vrf_network_state = vrf_network_state();
    ix_accounts.vrf_program = fake;
    assert_err(send(&mut h, &ix_accounts), "ConstraintAddress");
}

#[test]
fn live_supply_cap_counts_pending_mints_and_merges_free_room() {
    let mut p = launch_params();
    p.max_live_subs = 2;
    let mut h = H::with_params(p);
    let alice = h.player(20);
    let a = h.mint(&alice, RUST_BUCKET).unwrap();
    let nonce = random_nonce();
    let request = h.mint_request(&alice.pubkey(), &nonce);
    h.mint_commit(&alice, nonce).unwrap(); // pending counts toward the cap
    assert_err(h.mint_commit(&alice, random_nonce()), "SupplyCapReached");
    h.fulfill(request, value_for_roll(RUST_BUCKET, 0));
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

    assert_err(h.mint_commit(&alice, random_nonce()), "MintPaused");
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

    assert_err(h.expedition_commit(&alice, &a, random_nonce()), "StillAway");
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

    // Oracle never fulfils: after the timeout anyone can bring the sub home with no find.
    h.warp(24 * HOUR);
    h.expedition_start(&alice, &a, 1).unwrap();
    h.warp(HOUR);
    h.expedition_commit(&alice, &a, random_nonce()).unwrap();
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
