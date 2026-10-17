//! ORAO VRF (replaces Switchboard, which shut down on 2026-09-25). Layouts from
//! orao-solana-vrf 0.7.0; tested against the mainnet ORAO binary in LiteSVM.
//!
//! Commit: our instruction CPIs `request_v2(seed)`; ORAO creates the request account at
//! PDA(["orao-vrf-randomness-request", seed]) and its authorities fulfil it within seconds.
//! Reveal: we read the fulfilled 64-byte randomness from that account.
//!
//! - The fee is taken in the same instruction as the request, before anyone can know the value.
//! - `seed` mixes in a client nonce, so nobody can pre-create the request account for an upcoming
//!   commitment (which would make the commit fail), and a seed whose value is already known can't
//!   be reused: request accounts are created with `init`, so a second request for a seed fails.
//! - No valid fulfilment after `REVEAL_TIMEOUT` → the worst-outcome fallback (see mint.rs).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use solana_sha256_hasher::hashv;

pub const ORAO_VRF_ID: Pubkey = pubkey!("VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y");
pub const NETWORK_STATE_SEED: &[u8] = b"orao-vrf-network-configuration";
pub const REQUEST_SEED: &[u8] = b"orao-vrf-randomness-request";

const IX_REQUEST_V2: [u8; 8] = [38, 151, 209, 6, 195, 102, 28, 217];
pub const RANDOMNESS_V2_DISCRIMINATOR: [u8; 8] = [139, 239, 184, 215, 227, 86, 191, 226];
// RandomnessV2 = disc(8) | enum tag(1) | client(32) | seed(32) | randomness(64) when fulfilled
const TAG: usize = 8;
const SEED: usize = 8 + 1 + 32;
const RANDOMNESS: usize = SEED + 32;
const FULFILLED: u8 = 1;

/// sha256("abyss-haul:mint" ‖ mint_index LE ‖ payer ‖ nonce). Mirrored in client/src/orao.ts.
pub fn mint_seed(mint_index: u64, payer: &Pubkey, nonce: &[u8; 32]) -> [u8; 32] {
    hashv(&[b"abyss-haul:mint".as_slice(), &mint_index.to_le_bytes(), payer.as_ref(), nonce]).to_bytes()
}

/// sha256("abyss-haul:expedition" ‖ sub ‖ away_until LE ‖ nonce). Mirrored in client/src/orao.ts.
pub fn expedition_seed(sub: &Pubkey, away_until: i64, nonce: &[u8; 32]) -> [u8; 32] {
    hashv(&[b"abyss-haul:expedition".as_slice(), sub.as_ref(), &away_until.to_le_bytes(), nonce]).to_bytes()
}

/// CPI `request_v2(seed)`; `payer` pays ORAO's fee and the request account rent.
pub fn request<'info>(
    vrf_program: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    network_state: &AccountInfo<'info>,
    treasury: &AccountInfo<'info>,
    request: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    seed: [u8; 32],
) -> Result<()> {
    let mut data = IX_REQUEST_V2.to_vec();
    data.extend_from_slice(&seed);
    let ix = Instruction {
        program_id: ORAO_VRF_ID,
        accounts: vec![
            AccountMeta::new(payer.key(), true),
            AccountMeta::new(network_state.key(), false),
            AccountMeta::new(treasury.key(), false),
            AccountMeta::new(request.key(), false),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };
    invoke(
        &ix,
        &[payer.clone(), network_state.clone(), treasury.clone(), request.clone(), system_program.clone(), vrf_program.clone()],
    )?;
    Ok(())
}

/// First 32 bytes of the fulfilled randomness for `seed`, or None if not (validly) fulfilled.
/// Lenient on purpose: anything unexpected leads to the timeout fallback, never a stuck commitment.
pub fn fulfilled_value(acc: &AccountInfo, seed: &[u8; 32]) -> Option<[u8; 32]> {
    if *acc.owner != ORAO_VRF_ID {
        return None;
    }
    let data = acc.try_borrow_data().ok()?;
    let ok = data.len() >= RANDOMNESS + 64
        && data[..8] == RANDOMNESS_V2_DISCRIMINATOR
        && data[TAG] == FULFILLED
        && &data[SEED..SEED + 32] == seed;
    ok.then(|| data[RANDOMNESS..RANDOMNESS + 32].try_into().unwrap())
}
