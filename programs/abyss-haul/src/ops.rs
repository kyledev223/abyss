//! Helpers shared by instruction handlers.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::economics::split_fee;
use crate::error::ErrorCode;
use crate::state::{Checkpoints, Params, Pool, Vault};

pub fn transfer<'info>(from: &AccountInfo<'info>, to: &AccountInfo<'info>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    system_program::transfer(
        CpiContext::new(system_program::ID, Transfer { from: from.clone(), to: to.clone() }),
        amount,
    )
}

/// Takes a fee from `payer`: the pool share (rounded up) goes to the vault and into the stream with
/// a window reset; the rest goes straight to the treasury. Returns (to_pool, to_treasury).
#[allow(clippy::too_many_arguments)]
pub fn charge_fee<'info>(
    payer: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
    treasury: &AccountInfo<'info>,
    pool: &mut Pool,
    cps: &mut Checkpoints,
    params: &Params,
    fee: u64,
    now: i64,
) -> Result<(u64, u64)> {
    let (to_pool, to_treasury) = split_fee(fee, params.pool_bps);
    transfer(payer, vault, to_pool)?;
    transfer(payer, treasury, to_treasury)?;
    pool.rewards.deposit(to_pool, now, params.window, cps)?;
    pool.total_fees = pool.total_fees.checked_add(fee).ok_or(ErrorCode::MathOverflow)?;
    pool.total_to_treasury =
        pool.total_to_treasury.checked_add(to_treasury).ok_or(ErrorCode::MathOverflow)?;
    Ok((to_pool, to_treasury))
}

/// Pays a claim out of the vault, never dropping it below rent exemption.
pub fn pay_from_vault<'info>(vault: &AccountInfo<'info>, to: &AccountInfo<'info>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let rent_min = Rent::get()?.minimum_balance(8 + Vault::INIT_SPACE);
    let left = vault.lamports().checked_sub(amount).ok_or(ErrorCode::VaultBelowRent)?;
    require!(left >= rent_min, ErrorCode::VaultBelowRent);
    **vault.try_borrow_mut_lamports()? = left;
    let to_balance = to.lamports().checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
    **to.try_borrow_mut_lamports()? = to_balance;
    Ok(())
}

/// Keeps `active_harbors` in step with a harbor's depth going to or from zero.
pub fn track_active(pool: &mut Pool, before: u64, after: u64) {
    match (before > 0, after > 0) {
        (false, true) => pool.active_harbors += 1,
        (true, false) => pool.active_harbors -= 1,
        _ => {}
    }
}

pub fn now() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp)
}
