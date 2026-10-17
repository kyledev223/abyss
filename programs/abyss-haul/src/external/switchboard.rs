//! Switchboard On-Demand randomness reader. Layout from switchboard-on-demand 0.13.0
//! `RandomnessAccountData` (repr C, after the 8-byte discriminator):
//! authority 0..32, queue 32..64, seed_slothash 64..96, seed_slot 96..104, oracle 104..136,
//! reveal_slot 136..144, value 144..176.
//!
//! Commit/reveal rules (DESIGN.md §7):
//! - Commit: the account was committed in the previous slot and is not yet revealed. The fee is
//!   taken in the same instruction, so the outcome is fixed before anyone can know it.
//! - Reveal: the account must still carry the committed `seed_slot` and be revealed after it. We
//!   read the stored value directly instead of requiring same-slot consumption, so a reveal sent
//!   without our instruction cannot strand a paid mint. A re-committed account no longer matches,
//!   which only leads to the worst-outcome fallback after `REVEAL_TIMEOUT`.

use anchor_lang::prelude::*;

use crate::constants::SWITCHBOARD_ID;
use crate::error::ErrorCode;

pub const RANDOMNESS_DISCRIMINATOR: [u8; 8] = [10, 66, 229, 135, 220, 239, 217, 114];
const SEED_SLOT: usize = 8 + 96;
const REVEAL_SLOT: usize = 8 + 136;
const VALUE: usize = 8 + 144;
pub const RANDOMNESS_ACCOUNT_LEN: usize = 8 + 32 * 3 + 8 + 32 + 8 + 32 + 96 + 128;

pub struct Randomness {
    pub seed_slot: u64,
    pub reveal_slot: u64,
    pub value: [u8; 32],
}

pub fn read(acc: &AccountInfo) -> Result<Randomness> {
    require_keys_eq!(*acc.owner, SWITCHBOARD_ID, ErrorCode::InvalidRandomness);
    let data = acc.try_borrow_data()?;
    require!(
        data.len() >= VALUE + 32 && data[..8] == RANDOMNESS_DISCRIMINATOR,
        ErrorCode::InvalidRandomness
    );
    let u64_at = |o: usize| u64::from_le_bytes(data[o..o + 8].try_into().unwrap());
    Ok(Randomness {
        seed_slot: u64_at(SEED_SLOT),
        reveal_slot: u64_at(REVEAL_SLOT),
        value: data[VALUE..VALUE + 32].try_into().unwrap(),
    })
}

/// Returns the seed slot to store with the commitment.
pub fn check_commit(acc: &AccountInfo, slot: u64) -> Result<u64> {
    let r = read(acc)?;
    require!(
        r.seed_slot == slot.saturating_sub(1) && r.reveal_slot <= r.seed_slot,
        ErrorCode::RandomnessNotFresh
    );
    Ok(r.seed_slot)
}

/// The revealed value for this commitment, or None if not validly revealed. Lenient on purpose: a
/// closed, re-committed or otherwise unreadable account must lead to the timeout fallback, never
/// to a commitment that can't be settled.
pub fn revealed_value(acc: &AccountInfo, committed_seed_slot: u64) -> Option<[u8; 32]> {
    let r = read(acc).ok()?;
    (r.seed_slot == committed_seed_slot && r.reveal_slot > r.seed_slot).then_some(r.value)
}
