//! Metaplex Core CPIs. Layouts from mpl-core 0.12.1 `src/generated`.
//!
//! Subs carry a `PermanentFreezeDelegate` held by our `authority` PDA: docking freezes the asset in
//! the owner's wallet and undocking thaws it. A permanent delegate cannot be revoked or removed by
//! the owner, so a docked sub can never be moved out from under its harbor.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

use crate::constants::MPL_CORE_ID;
use crate::error::ErrorCode;

const IX_CREATE_V2: u8 = 20;
const IX_CREATE_COLLECTION_V2: u8 = 21;
const IX_UPDATE_PLUGIN_V1: u8 = 6;
const IX_BURN_V1: u8 = 12;
const DATA_STATE_ACCOUNT: u8 = 0;
const PLUGIN_PERMANENT_FREEZE_DELEGATE: u8 = 5;
const PLUGIN_AUTHORITY_ADDRESS: u8 = 3;
const KEY_ASSET_V1: u8 = 1;
const UPDATE_AUTHORITY_COLLECTION: u8 = 2;

fn put_str(buf: &mut Vec<u8>, s: &str) {
    buf.extend_from_slice(&(s.len() as u32).to_le_bytes());
    buf.extend_from_slice(s.as_bytes());
}

fn core_placeholder() -> AccountMeta {
    AccountMeta::new_readonly(MPL_CORE_ID, false)
}

/// Creates the collection, with our authority PDA as update authority.
pub fn create_collection<'info>(
    core_program: &AccountInfo<'info>,
    collection: &AccountInfo<'info>,
    update_authority: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    uri: &str,
) -> Result<()> {
    let mut data = vec![IX_CREATE_COLLECTION_V2];
    put_str(&mut data, crate::constants::COLLECTION_NAME);
    put_str(&mut data, uri);
    data.push(0); // plugins: None
    data.push(0); // external_plugin_adapters: None
    let ix = Instruction {
        program_id: MPL_CORE_ID,
        accounts: vec![
            AccountMeta::new(collection.key(), true),
            AccountMeta::new_readonly(update_authority.key(), false),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };
    invoke_signed(
        &ix,
        &[collection.clone(), update_authority.clone(), payer.clone(), system_program.clone(), core_program.clone()],
        &[],
    )?;
    Ok(())
}

/// Creates a sub asset at a PDA address inside the collection, owned by `owner`, with an unfrozen
/// `PermanentFreezeDelegate` held by `authority`.
#[allow(clippy::too_many_arguments)]
pub fn create_asset<'info>(
    core_program: &AccountInfo<'info>,
    asset: &AccountInfo<'info>,
    collection: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    name: &str,
    uri: &str,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = vec![IX_CREATE_V2, DATA_STATE_ACCOUNT];
    put_str(&mut data, name);
    put_str(&mut data, uri);
    data.push(1); // plugins: Some
    data.extend_from_slice(&1u32.to_le_bytes()); // one PluginAuthorityPair
    data.extend_from_slice(&[PLUGIN_PERMANENT_FREEZE_DELEGATE, 0]); // { frozen: false }
    data.push(1); // authority: Some
    data.push(PLUGIN_AUTHORITY_ADDRESS);
    data.extend_from_slice(authority.key().as_ref());
    data.push(0); // external_plugin_adapters: None
    let ix = Instruction {
        program_id: MPL_CORE_ID,
        accounts: vec![
            AccountMeta::new(asset.key(), true),
            AccountMeta::new(collection.key(), false),
            AccountMeta::new_readonly(authority.key(), true),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(owner.key(), false),
            core_placeholder(), // update_authority: the collection's
            AccountMeta::new_readonly(system_program.key(), false),
            core_placeholder(), // log_wrapper
        ],
        data,
    };
    invoke_signed(
        &ix,
        &[
            asset.clone(),
            collection.clone(),
            authority.clone(),
            payer.clone(),
            owner.clone(),
            system_program.clone(),
            core_program.clone(),
        ],
        signer_seeds,
    )?;
    Ok(())
}

/// Freezes or thaws an asset through its `PermanentFreezeDelegate` (signed by our authority PDA).
pub fn set_frozen<'info>(
    core_program: &AccountInfo<'info>,
    asset: &AccountInfo<'info>,
    collection: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    frozen: bool,
    authority_seeds: &[&[&[u8]]],
) -> Result<()> {
    let ix = Instruction {
        program_id: MPL_CORE_ID,
        accounts: vec![
            AccountMeta::new(asset.key(), false),
            AccountMeta::new(collection.key(), false),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(authority.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
            core_placeholder(), // log_wrapper
        ],
        data: vec![IX_UPDATE_PLUGIN_V1, PLUGIN_PERMANENT_FREEZE_DELEGATE, frozen as u8],
    };
    invoke_signed(
        &ix,
        &[
            asset.clone(),
            collection.clone(),
            payer.clone(),
            authority.clone(),
            system_program.clone(),
            core_program.clone(),
        ],
        authority_seeds,
    )?;
    Ok(())
}

/// Burns an unfrozen asset; `owner` must be a signer of the outer transaction.
pub fn burn<'info>(
    core_program: &AccountInfo<'info>,
    asset: &AccountInfo<'info>,
    collection: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    let ix = Instruction {
        program_id: MPL_CORE_ID,
        accounts: vec![
            AccountMeta::new(asset.key(), false),
            AccountMeta::new(collection.key(), false),
            AccountMeta::new(owner.key(), true),
            AccountMeta::new_readonly(owner.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
            core_placeholder(), // log_wrapper
        ],
        data: vec![IX_BURN_V1, 0], // compression_proof: None
    };
    invoke_signed(
        &ix,
        &[asset.clone(), collection.clone(), owner.clone(), system_program.clone(), core_program.clone()],
        &[],
    )?;
    Ok(())
}

/// Reads the owner of a Core asset and checks it belongs to `collection`.
pub fn asset_owner(asset: &AccountInfo, collection: &Pubkey) -> Result<Pubkey> {
    require_keys_eq!(*asset.owner, MPL_CORE_ID, ErrorCode::InvalidAsset);
    let data = asset.try_borrow_data()?;
    // key(1) owner(32) update_authority: enum tag(1) + pubkey(32)
    require!(data.len() >= 66 && data[0] == KEY_ASSET_V1, ErrorCode::InvalidAsset);
    require!(data[33] == UPDATE_AUTHORITY_COLLECTION, ErrorCode::InvalidAsset);
    require!(&data[34..66] == collection.as_ref(), ErrorCode::InvalidAsset);
    Ok(Pubkey::try_from(&data[1..33]).map_err(|_| ErrorCode::InvalidAsset)?)
}
