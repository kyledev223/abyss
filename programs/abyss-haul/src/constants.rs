use anchor_lang::prelude::*;

// PDA seeds (DESIGN.md §3).
#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const POOL_SEED: &[u8] = b"pool";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const AUTHORITY_SEED: &[u8] = b"authority";
#[constant]
pub const HARBOR_SEED: &[u8] = b"harbor";
#[constant]
pub const SUB_SEED: &[u8] = b"sub";
#[constant]
pub const ASSET_SEED: &[u8] = b"asset";
#[constant]
pub const PENDING_SEED: &[u8] = b"pending";

pub const MPL_CORE_ID: Pubkey = pubkey!("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

#[cfg(not(feature = "devnet"))]
pub const SWITCHBOARD_ID: Pubkey = pubkey!("SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv");
#[cfg(feature = "devnet")]
pub const SWITCHBOARD_ID: Pubkey = pubkey!("Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2");

pub const TIERS: usize = 6;
/// Tiers that can be merged (all but the top). A named constant because `InitSpace` cannot
/// evaluate `TIERS - 1` in an array length.
pub const MERGEABLE_TIERS: usize = 5;
const _: () = assert!(MERGEABLE_TIERS == TIERS - 1);
pub const BPS: u64 = 10_000;

/// Admin bounds on `Params` (DESIGN.md §6).
pub const MIN_POOL_BPS: u16 = 5_000;
pub const MIN_WINDOW: i64 = 3_600;
pub const MAX_WINDOW: i64 = 7 * 86_400;
pub const MAX_REINFORCE_LEVEL: u8 = 20;
pub const MAX_HARBOR_SLOTS: u8 = 64;
pub const MAX_GROWTH_BPS: u16 = 30_000;

/// Expeditions last 1..=MAX_EXPEDITION_HOURS; the next one may start this long after a return.
pub const MAX_EXPEDITION_HOURS: u8 = 6;
pub const EXPEDITION_COOLDOWN: i64 = 24 * 3_600;
/// Boosts must expire well before the next expedition can return (one active boost per harbor).
pub const MAX_BOOST_HOURS: i64 = 12;

/// If randomness is not revealed this long after commit, reveal falls back to the worst outcome
/// (Rust Bucket / no find), so a stalled oracle cannot strand a paid mint or a sub at sea.
pub const REVEAL_TIMEOUT: i64 = 3_600;

/// Prepaid by the minter at commit; covers the asset and `Sub` rent at reveal. The unused part
/// is refunded to the minter when the pending mint closes.
pub const MINT_RENT_DEPOSIT: u64 = 10_000_000;

pub const MAX_URI_BASE_LEN: usize = 96;
pub const NAME_PREFIX: &str = "Abyss Haul #";
pub const COLLECTION_NAME: &str = "Abyss Haul Fleet";
