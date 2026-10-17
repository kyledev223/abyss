//! Events emitted with `emit_cpi!`; the Helius webhook stores them keyed by (signature, index).

use anchor_lang::prelude::*;

#[event]
pub struct FeePaid {
    pub payer: Pubkey,
    pub kind: FeeKind,
    pub amount: u64,
    pub to_pool: u64,
    pub to_treasury: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum FeeKind {
    Mint,
    Reinforce,
    Merge,
    HarborSlot,
}

#[event]
pub struct PoolFunded {
    pub funder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MintCommitted {
    pub payer: Pubkey,
    pub mint_index: u64,
    pub randomness: Pubkey,
}

#[event]
pub struct SubMinted {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub mint_index: u64,
    pub tier: u8,
    pub depth: u64,
    /// True when randomness was never revealed and the fallback (lowest tier) applied.
    pub fallback: bool,
}

#[event]
pub struct Docked {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub depth: u64,
}

#[event]
pub struct Undocked {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub depth: u64,
}

#[event]
pub struct Claimed {
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Reinforced {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub level: u8,
    pub depth: u64,
}

#[event]
pub struct Merged {
    pub owner: Pubkey,
    pub burned: [Pubkey; 2],
    pub asset: Pubkey,
    pub tier: u8,
    pub depth: u64,
}

#[event]
pub struct HarborExpanded {
    pub owner: Pubkey,
    pub slots: u8,
}

#[event]
pub struct ExpeditionStarted {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub hours: u8,
    pub returns_at: i64,
}

#[event]
pub struct ExpeditionReturned {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub outcome: ExpeditionOutcome,
    pub fallback: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExpeditionOutcome {
    Nothing,
    Barnacle { bit: u8 },
    Boost { extra: u64, end_hour: i64 },
}

#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
}

#[event]
pub struct PauseSet {
    pub mint: bool,
    pub upgrades: bool,
}
