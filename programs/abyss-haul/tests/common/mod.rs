//! LiteSVM harness: our program plus the real Metaplex Core binary (dumped from mainnet), fake
//! Switchboard randomness accounts (our program only reads them), and a controllable clock.
#![allow(dead_code)]

use abyss_haul::constants::*;
use abyss_haul::external::switchboard::{RANDOMNESS_ACCOUNT_LEN, RANDOMNESS_DISCRIMINATOR};
use abyss_haul::rewards::RewardState;
use abyss_haul::state::*;
use anchor_lang::prelude::{Clock, Pubkey};
use anchor_lang::solana_program::bpf_loader_upgradeable;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::{system_program, AccountDeserialize, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_compute_budget_interface::ComputeBudgetInstruction;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

pub const SOL: u64 = 1_000_000_000;
pub const T0: i64 = 1_760_000_000;
pub const HOUR: i64 = 3_600;
const PROGRAM_SO: &[u8] = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/abyss_haul.so"));
const CORE_SO: &[u8] = include_bytes!("../fixtures/mpl_core.so");

pub type TxResult = Result<(), String>;

pub fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &abyss_haul::ID).0
}
pub fn config_pda() -> Pubkey { pda(&[CONFIG_SEED]) }
pub fn pool_pda() -> Pubkey { pda(&[POOL_SEED]) }
pub fn vault_pda() -> Pubkey { pda(&[VAULT_SEED]) }
pub fn authority_pda() -> Pubkey { pda(&[AUTHORITY_SEED]) }
pub fn event_authority() -> Pubkey { pda(&[b"__event_authority"]) }
pub fn harbor_pda(owner: &Pubkey) -> Pubkey { pda(&[HARBOR_SEED, owner.as_ref()]) }
pub fn sub_pda(asset: &Pubkey) -> Pubkey { pda(&[SUB_SEED, asset.as_ref()]) }
pub fn asset_pda(index: u64) -> Pubkey { pda(&[ASSET_SEED, &index.to_le_bytes()]) }
pub fn pending_pda(index: u64) -> Pubkey { pda(&[PENDING_SEED, &index.to_le_bytes()]) }
pub fn program_data() -> Pubkey {
    Pubkey::find_program_address(&[abyss_haul::ID.as_ref()], &bpf_loader_upgradeable::ID).0
}

/// Launch parameters from config/defaults.json, the single source of truth.
pub fn launch_params() -> Params {
    let d: serde_json::Value =
        serde_json::from_str(include_str!("../../../../config/defaults.json")).unwrap();
    let u = |v: &serde_json::Value| v.as_u64().unwrap();
    let tiers = d["tiers"].as_array().unwrap();
    let arr6 = |f: &dyn Fn(&serde_json::Value) -> u64| -> [u64; 6] {
        std::array::from_fn(|i| f(&tiers[i]))
    };
    let odds = arr6(&|t| u(&t["oddsBps"]));
    Params {
        mint_price: u(&d["mintPriceLamports"]),
        pool_bps: u(&d["poolBps"]) as u16,
        window: u(&d["windowSeconds"]) as i64,
        tier_odds_bps: odds.map(|o| o as u16),
        tier_depth: arr6(&|t| u(&t["depth"])),
        reinforce_bps_per_level: u(&d["reinforce"]["bpsPerLevel"]) as u16,
        reinforce_max_level: u(&d["reinforce"]["maxLevel"]) as u8,
        reinforce_lamports_per_depth: u(&d["reinforce"]["lamportsPerBaseDepth"]),
        reinforce_growth_bps: u(&d["reinforce"]["growthBps"]) as u16,
        merge_fee: std::array::from_fn(|i| u(&d["mergeFeeLamports"][i])),
        harbor_start_slots: u(&d["harbor"]["startSlots"]) as u8,
        harbor_max_slots: u(&d["harbor"]["maxSlots"]) as u8,
        slot_base_lamports: u(&d["harbor"]["baseLamports"]),
        slot_growth_bps: u(&d["harbor"]["growthBps"]) as u16,
        max_live_subs: u(&d["maxLiveSubs"]) as u32,
        expedition_boost_bps: u(&d["expedition"]["boostBps"]) as u16,
        expedition_boost_hours_per_hour: u(&d["expedition"]["boostHoursPerHour"]) as u8,
        expedition_boost_chance_bps: u(&d["expedition"]["boostChanceBps"]) as u16,
        expedition_barnacle_chance_bps: u(&d["expedition"]["barnacleChanceBps"]) as u16,
    }
}

/// Randomness value whose roll (first 8 bytes mod 10000) is `roll`; byte 8 picks the barnacle.
pub fn value_for_roll(roll: u64, barnacle: u8) -> [u8; 32] {
    let mut v = [0u8; 32];
    v[..8].copy_from_slice(&roll.to_le_bytes());
    v[8] = barnacle;
    v
}

pub struct H {
    pub svm: LiteSVM,
    pub deployer: Keypair,
    pub admin: Keypair,
    pub treasury: Pubkey,
    pub collection: Pubkey,
    pub checkpoints: Pubkey,
    /// Compute units used by the last successful transaction (excluding nothing; includes CPIs).
    pub last_cu: u64,
}

impl H {
    /// Programs loaded, deployer set as upgrade authority, nothing initialized.
    pub fn boot() -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program(abyss_haul::ID, PROGRAM_SO).unwrap();
        svm.add_program(MPL_CORE_ID, CORE_SO).unwrap();
        let mut clock = svm.get_sysvar::<Clock>();
        clock.unix_timestamp = T0;
        svm.set_sysvar(&clock);
        svm.warp_to_slot(1_000);

        let deployer = Keypair::new();
        let admin = Keypair::new();
        let treasury = Keypair::new().pubkey();
        for k in [deployer.pubkey(), admin.pubkey(), treasury] {
            svm.airdrop(&k, 1_000 * SOL).unwrap();
        }
        // ProgramData: tag u32 | slot u64 | Option<Pubkey> upgrade authority
        let pd = program_data();
        let mut acc = svm.get_account(&pd).unwrap();
        acc.data[12] = 1;
        acc.data[13..45].copy_from_slice(deployer.pubkey().as_ref());
        svm.set_account(pd, acc).unwrap();

        Self { svm, deployer, admin, treasury, collection: Pubkey::default(), checkpoints: Pubkey::default(), last_cu: 0 }
    }

    /// Booted and initialized with launch parameters; admin is a separate key (stand-in for Squads).
    pub fn new() -> Self {
        Self::with_params(launch_params())
    }

    pub fn with_params(params: Params) -> Self {
        let mut h = Self::boot();
        let deployer = h.deployer.insecure_clone();
        h.initialize(&deployer, params).unwrap();
        h
    }

    pub fn initialize(&mut self, signer: &Keypair, params: Params) -> TxResult {
        let ckp = Keypair::new();
        let col = Keypair::new();
        let space = 8 + std::mem::size_of::<Checkpoints>();
        let create = solana_system_interface::instruction::create_account(
            &signer.pubkey(),
            &ckp.pubkey(),
            self.svm.minimum_balance_for_rent_exemption(space),
            space as u64,
            &abyss_haul::ID,
        );
        let ix = Instruction::new_with_bytes(
            abyss_haul::ID,
            &abyss_haul::instruction::Initialize {
                admin: self.admin.pubkey(),
                treasury: self.treasury,
                params,
                uri_base: "https://abysshaul.example/api/meta/".into(),
                collection_uri: "https://abysshaul.example/api/collection".into(),
            }
            .data(),
            abyss_haul::accounts::Initialize {
                deployer: signer.pubkey(),
                program_data: program_data(),
                config: config_pda(),
                pool: pool_pda(),
                vault: vault_pda(),
                checkpoints: ckp.pubkey(),
                authority: authority_pda(),
                collection: col.pubkey(),
                mpl_core: MPL_CORE_ID,
                system_program: system_program::ID,
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[create, ix], &[signer, &ckp, &col])?;
        self.collection = col.pubkey();
        self.checkpoints = ckp.pubkey();
        Ok(())
    }

    // ---------------------------------------------------------------- transactions

    pub fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
        let mut all = vec![ComputeBudgetInstruction::set_compute_unit_limit(1_400_000)];
        all.extend_from_slice(ixs);
        let payer = signers[0].pubkey();
        let msg = Message::new_with_blockhash(&all, Some(&payer), &self.svm.latest_blockhash());
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
        let res = self.svm.send_transaction(tx);
        self.svm.expire_blockhash();
        match res {
            Ok(meta) => {
                self.last_cu = meta.compute_units_consumed;
                Ok(())
            }
            Err(e) => Err(format!("{:?}\n{}", e.err, e.meta.logs.join("\n"))),
        }
    }

    fn ix(&self, data: Vec<u8>, accounts: Vec<AccountMeta>) -> Instruction {
        Instruction::new_with_bytes(abyss_haul::ID, &data, accounts)
    }

    pub fn player(&mut self, sol: u64) -> Keypair {
        let k = Keypair::new();
        self.svm.airdrop(&k.pubkey(), sol * SOL).unwrap();
        k
    }

    // ---------------------------------------------------------------- clock and randomness

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn slot(&self) -> u64 {
        self.svm.get_sysvar::<Clock>().slot
    }

    pub fn warp(&mut self, secs: i64) {
        let clock = self.svm.get_sysvar::<Clock>();
        let ts = clock.unix_timestamp + secs;
        self.svm.warp_to_slot(clock.slot + (secs as u64 * 5 / 2).max(1));
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = ts;
        self.svm.set_sysvar(&clock);
    }

    pub fn write_randomness(&mut self, key: Pubkey, seed_slot: u64, reveal_slot: u64, value: [u8; 32]) {
        let mut data = vec![0u8; RANDOMNESS_ACCOUNT_LEN];
        data[..8].copy_from_slice(&RANDOMNESS_DISCRIMINATOR);
        data[8 + 96..8 + 104].copy_from_slice(&seed_slot.to_le_bytes());
        data[8 + 136..8 + 144].copy_from_slice(&reveal_slot.to_le_bytes());
        data[8 + 144..8 + 176].copy_from_slice(&value);
        let lamports = self.svm.minimum_balance_for_rent_exemption(data.len());
        self.svm
            .set_account(key, Account { lamports, data, owner: SWITCHBOARD_ID, executable: false, rent_epoch: 0 })
            .unwrap();
    }

    /// A randomness account committed in the previous slot, unrevealed.
    pub fn fresh_randomness(&mut self) -> Pubkey {
        let key = Keypair::new().pubkey();
        let slot = self.slot();
        self.write_randomness(key, slot - 1, 0, [0; 32]);
        key
    }

    /// Advances one slot and reveals `value` on a committed randomness account.
    pub fn reveal(&mut self, key: Pubkey, value: [u8; 32]) {
        self.warp(1);
        let seed = u64::from_le_bytes(self.svm.get_account(&key).unwrap().data[8 + 96..8 + 104].try_into().unwrap());
        let slot = self.slot();
        self.write_randomness(key, seed, slot, value);
    }

    // ---------------------------------------------------------------- reads

    pub fn fetch<T: AccountDeserialize>(&self, key: &Pubkey) -> Option<T> {
        let acc = self.svm.get_account(key)?;
        if acc.data.is_empty() {
            return None;
        }
        T::try_deserialize(&mut acc.data.as_slice()).ok()
    }
    pub fn config(&self) -> Config { self.fetch(&config_pda()).unwrap() }
    pub fn pool(&self) -> Pool { self.fetch(&pool_pda()).unwrap() }
    pub fn harbor(&self, owner: &Pubkey) -> Harbor { self.fetch(&harbor_pda(owner)).unwrap() }
    pub fn sub(&self, asset: &Pubkey) -> Sub { self.fetch(&sub_pda(asset)).unwrap() }
    pub fn lamports(&self, key: &Pubkey) -> u64 { self.svm.get_account(key).map_or(0, |a| a.lamports) }

    pub fn checkpoints_state(&self) -> Box<Checkpoints> {
        let acc = self.svm.get_account(&self.checkpoints).unwrap();
        Box::new(bytemuck::pod_read_unaligned::<Checkpoints>(&acc.data[8..]))
    }

    /// Owner of a Core asset, or None if it does not exist / was burned.
    pub fn core_owner(&self, asset: &Pubkey) -> Option<Pubkey> {
        let acc = self.svm.get_account(asset)?;
        (acc.owner == MPL_CORE_ID && acc.data.len() > 33 && acc.data[0] == 1)
            .then(|| Pubkey::try_from(&acc.data[1..33]).unwrap())
    }

    pub fn vault_rent_min(&self) -> u64 {
        self.svm.minimum_balance_for_rent_exemption(8)
    }

    /// The vault holds exactly deposited − claimed above rent, and covers the stream plus every
    /// harbor's owed + pending (computed with the program's own engine on the live accounts).
    pub fn assert_solvent(&self, owners: &[Pubkey]) {
        let pool = self.pool();
        let vault = self.lamports(&vault_pda()) - self.vault_rent_min();
        assert_eq!(
            vault,
            pool.rewards.total_deposited - pool.rewards.total_claimed,
            "vault balance != deposited − claimed"
        );
        let mut cps = self.checkpoints_state();
        let mut r: RewardState = pool.rewards.clone();
        let now = self.now();
        r.accrue(now, &mut *cps).unwrap();
        let mut owed: u128 = 0;
        let mut depth: u64 = 0;
        for o in owners {
            if let Some(h) = self.fetch::<Harbor>(&harbor_pda(o)) {
                let mut hr = h.rewards.clone();
                r.settle(&mut hr, now, &mut *cps).unwrap();
                owed += hr.owed as u128;
                depth += hr.depth + hr.boost_extra;
            }
        }
        let liabilities = r.stream_remaining as u128 + owed;
        assert!(vault as u128 >= liabilities, "INSOLVENT: vault {vault} < liabilities {liabilities}");
        assert_eq!(r.total_depth, depth, "total_depth != Σ harbor depth + active boosts");
    }

    // ---------------------------------------------------------------- instructions

    pub fn open_harbor(&mut self, owner: &Keypair) -> TxResult {
        let ix = self.ix(
            abyss_haul::instruction::OpenHarbor {}.data(),
            abyss_haul::accounts::OpenHarbor {
                owner: owner.pubkey(),
                config: config_pda(),
                harbor: harbor_pda(&owner.pubkey()),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[owner])
    }

    pub fn fund(&mut self, funder: &Keypair, amount: u64) -> TxResult {
        let ix = self.ix(
            abyss_haul::instruction::FundPool { amount }.data(),
            abyss_haul::accounts::FundPool {
                funder: funder.pubkey(),
                config: config_pda(),
                pool: pool_pda(),
                vault: vault_pda(),
                checkpoints: self.checkpoints,
                system_program: system_program::ID,
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[funder])
    }

    pub fn mint_commit(&mut self, payer: &Keypair, randomness: Pubkey) -> TxResult {
        let index = self.pool().minted_count;
        let ix = self.ix(
            abyss_haul::instruction::MintCommit {}.data(),
            abyss_haul::accounts::MintCommit {
                payer: payer.pubkey(),
                config: config_pda(),
                pool: pool_pda(),
                vault: vault_pda(),
                treasury: self.treasury,
                checkpoints: self.checkpoints,
                randomness,
                pending: pending_pda(index),
                system_program: system_program::ID,
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[payer])
    }

    pub fn mint_reveal(&mut self, cranker: &Keypair, index: u64) -> TxResult {
        let pending: PendingMint = self.fetch(&pending_pda(index)).ok_or("no pending mint")?;
        let asset = asset_pda(index);
        let ix = self.ix(
            abyss_haul::instruction::MintReveal {}.data(),
            abyss_haul::accounts::MintReveal {
                cranker: cranker.pubkey(),
                payer: pending.payer,
                config: config_pda(),
                pool: pool_pda(),
                pending: pending_pda(index),
                randomness: pending.randomness,
                asset,
                sub: sub_pda(&asset),
                collection: self.collection,
                authority: authority_pda(),
                mpl_core: MPL_CORE_ID,
                system_program: system_program::ID,
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[cranker])
    }

    /// Commit + reveal with a chosen roll (tier by cumulative odds). Returns the new asset.
    pub fn mint(&mut self, player: &Keypair, roll: u64) -> Result<Pubkey, String> {
        let index = self.pool().minted_count;
        let r = self.fresh_randomness();
        self.mint_commit(player, r)?;
        self.reveal(r, value_for_roll(roll, 0));
        self.mint_reveal(player, index)?;
        Ok(asset_pda(index))
    }

    fn dock_accounts(&self, owner: &Pubkey, asset: &Pubkey) -> Vec<AccountMeta> {
        abyss_haul::accounts::DockAction {
            owner: *owner,
            config: config_pda(),
            pool: pool_pda(),
            checkpoints: self.checkpoints,
            harbor: harbor_pda(owner),
            sub: sub_pda(asset),
            asset: *asset,
            collection: self.collection,
            authority: authority_pda(),
            mpl_core: MPL_CORE_ID,
            system_program: system_program::ID,
            event_authority: event_authority(),
            program: abyss_haul::ID,
        }
        .to_account_metas(None)
    }

    pub fn dock(&mut self, owner: &Keypair, asset: &Pubkey) -> TxResult {
        let ix = self.ix(abyss_haul::instruction::Dock {}.data(), self.dock_accounts(&owner.pubkey(), asset));
        self.send(&[ix], &[owner])
    }

    pub fn undock(&mut self, owner: &Keypair, asset: &Pubkey) -> TxResult {
        let ix = self.ix(abyss_haul::instruction::Undock {}.data(), self.dock_accounts(&owner.pubkey(), asset));
        self.send(&[ix], &[owner])
    }

    /// Returns the amount claimed.
    pub fn claim(&mut self, owner: &Keypair) -> Result<u64, String> {
        let before = self.harbor(&owner.pubkey()).total_claimed;
        let ix = self.ix(
            abyss_haul::instruction::Claim {}.data(),
            abyss_haul::accounts::Claim {
                owner: owner.pubkey(),
                config: config_pda(),
                pool: pool_pda(),
                vault: vault_pda(),
                checkpoints: self.checkpoints,
                harbor: harbor_pda(&owner.pubkey()),
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[owner])?;
        Ok(self.harbor(&owner.pubkey()).total_claimed - before)
    }

    pub fn settle(&mut self, signer: &Keypair, owner: &Pubkey) -> TxResult {
        let ix = self.ix(
            abyss_haul::instruction::Settle {}.data(),
            abyss_haul::accounts::Settle {
                config: config_pda(),
                pool: pool_pda(),
                checkpoints: self.checkpoints,
                harbor: harbor_pda(owner),
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[signer])
    }

    pub fn crank(&mut self, signer: &Keypair) -> TxResult {
        let ix = self.ix(
            abyss_haul::instruction::Crank {}.data(),
            abyss_haul::accounts::Crank { config: config_pda(), pool: pool_pda(), checkpoints: self.checkpoints }
                .to_account_metas(None),
        );
        self.send(&[ix], &[signer])
    }

    pub fn expand(&mut self, owner: &Keypair) -> TxResult {
        let ix = self.ix(
            abyss_haul::instruction::ExpandHarbor {}.data(),
            abyss_haul::accounts::ExpandHarbor {
                owner: owner.pubkey(),
                config: config_pda(),
                pool: pool_pda(),
                vault: vault_pda(),
                treasury: self.treasury,
                checkpoints: self.checkpoints,
                harbor: harbor_pda(&owner.pubkey()),
                system_program: system_program::ID,
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[owner])
    }

    pub fn reinforce(&mut self, owner: &Keypair, asset: &Pubkey) -> TxResult {
        let ix = self.ix(
            abyss_haul::instruction::Reinforce {}.data(),
            abyss_haul::accounts::Reinforce {
                owner: owner.pubkey(),
                config: config_pda(),
                pool: pool_pda(),
                vault: vault_pda(),
                treasury: self.treasury,
                checkpoints: self.checkpoints,
                harbor: harbor_pda(&owner.pubkey()),
                sub: sub_pda(asset),
                asset: *asset,
                system_program: system_program::ID,
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[owner])
    }

    /// Returns the new asset.
    pub fn merge(&mut self, owner: &Keypair, a: &Pubkey, b: &Pubkey) -> Result<Pubkey, String> {
        let new_asset = asset_pda(self.pool().minted_count);
        let ix = self.ix(
            abyss_haul::instruction::Merge {}.data(),
            abyss_haul::accounts::Merge {
                owner: owner.pubkey(),
                config: config_pda(),
                pool: pool_pda(),
                vault: vault_pda(),
                treasury: self.treasury,
                checkpoints: self.checkpoints,
                harbor: harbor_pda(&owner.pubkey()),
                sub_a: sub_pda(a),
                sub_b: sub_pda(b),
                asset_a: *a,
                asset_b: *b,
                new_asset,
                new_sub: sub_pda(&new_asset),
                collection: self.collection,
                authority: authority_pda(),
                mpl_core: MPL_CORE_ID,
                system_program: system_program::ID,
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[owner])?;
        Ok(new_asset)
    }

    pub fn expedition_start(&mut self, owner: &Keypair, asset: &Pubkey, hours: u8) -> TxResult {
        let ix = self.ix(
            abyss_haul::instruction::ExpeditionStart { hours }.data(),
            abyss_haul::accounts::ExpeditionStart {
                owner: owner.pubkey(),
                config: config_pda(),
                pool: pool_pda(),
                checkpoints: self.checkpoints,
                harbor: harbor_pda(&owner.pubkey()),
                sub: sub_pda(asset),
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[owner])
    }

    pub fn expedition_commit(&mut self, owner: &Keypair, asset: &Pubkey, randomness: Pubkey) -> TxResult {
        let ix = self.ix(
            abyss_haul::instruction::ExpeditionReturnCommit {}.data(),
            abyss_haul::accounts::ExpeditionReturnCommit {
                owner: owner.pubkey(),
                harbor: harbor_pda(&owner.pubkey()),
                sub: sub_pda(asset),
                randomness,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[owner])
    }

    pub fn expedition_reveal(&mut self, cranker: &Keypair, asset: &Pubkey) -> TxResult {
        let sub = self.sub(asset);
        let ix = self.ix(
            abyss_haul::instruction::ExpeditionReturnReveal {}.data(),
            abyss_haul::accounts::ExpeditionReturnReveal {
                cranker: cranker.pubkey(),
                config: config_pda(),
                pool: pool_pda(),
                checkpoints: self.checkpoints,
                harbor: sub.harbor,
                sub: sub_pda(asset),
                randomness: sub.randomness,
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[cranker])
    }

    /// Full return: commit, reveal `roll`, settle.
    pub fn expedition_return(&mut self, owner: &Keypair, asset: &Pubkey, roll: u64) -> TxResult {
        let r = self.fresh_randomness();
        self.expedition_commit(owner, asset, r)?;
        self.reveal(r, value_for_roll(roll, 3));
        self.expedition_reveal(owner, asset)
    }

    fn admin_accounts(&self, admin: &Pubkey) -> Vec<AccountMeta> {
        abyss_haul::accounts::AdminOnly {
            admin: *admin,
            config: config_pda(),
            event_authority: event_authority(),
            program: abyss_haul::ID,
        }
        .to_account_metas(None)
    }

    pub fn set_pause(&mut self, signer: &Keypair, mint: bool, upgrades: bool) -> TxResult {
        let ix = self.ix(abyss_haul::instruction::SetPause { mint, upgrades }.data(), self.admin_accounts(&signer.pubkey()));
        self.send(&[ix], &[signer])
    }

    pub fn update_config(&mut self, signer: &Keypair, params: Params) -> TxResult {
        let c = self.config();
        let ix = self.ix(
            abyss_haul::instruction::UpdateConfig { params, treasury: c.treasury, uri_base: c.uri_base }.data(),
            self.admin_accounts(&signer.pubkey()),
        );
        self.send(&[ix], &[signer])
    }

    pub fn propose_admin(&mut self, signer: &Keypair, new_admin: Pubkey) -> TxResult {
        let ix = self.ix(abyss_haul::instruction::ProposeAdmin { new_admin }.data(), self.admin_accounts(&signer.pubkey()));
        self.send(&[ix], &[signer])
    }

    pub fn accept_admin(&mut self, signer: &Keypair) -> TxResult {
        let ix = self.ix(
            abyss_haul::instruction::AcceptAdmin {}.data(),
            abyss_haul::accounts::AcceptAdmin {
                new_admin: signer.pubkey(),
                config: config_pda(),
                event_authority: event_authority(),
                program: abyss_haul::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[signer])
    }

    /// Plain Core TransferV1 signed by `owner` (used to prove docked subs are frozen).
    pub fn core_transfer(&mut self, owner: &Keypair, asset: &Pubkey, to: &Pubkey) -> TxResult {
        let ix = Instruction {
            program_id: MPL_CORE_ID,
            accounts: vec![
                AccountMeta::new(*asset, false),
                AccountMeta::new(self.collection, false),
                AccountMeta::new(owner.pubkey(), true),
                AccountMeta::new_readonly(owner.pubkey(), true),
                AccountMeta::new_readonly(*to, false),
                AccountMeta::new_readonly(MPL_CORE_ID, false),
                AccountMeta::new_readonly(MPL_CORE_ID, false),
            ],
            data: vec![14, 0],
        };
        self.send(&[ix], &[owner])
    }
}

/// Asserts a failed transaction carries the given Anchor error name.
pub fn assert_err(res: TxResult, name: &str) {
    match res {
        Ok(()) => panic!("expected error {name}, transaction succeeded"),
        Err(logs) => assert!(logs.contains(&format!("Error Code: {name}")), "expected {name}, got:\n{logs}"),
    }
}
