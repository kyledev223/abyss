/**
 * Multi-step player flows. Each returns unsigned transactions, so the same code serves a browser
 * wallet, scripts and the keeper.
 */
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import type { AbyssClient } from './client';
import { MEASURED_CU, REVEAL_TIMEOUT } from './constants';
import type { FeeOptions } from './fees';
import { expeditionSeed, mintSeed, oraoRequest, randomNonce, waitForFulfillment } from './orao';

/**
 * Pays for a mint and requests ORAO randomness in one transaction. If another mint lands first the
 * mint index moves and the transaction fails harmlessly; call again to rebuild with the new index.
 */
export async function prepareMintCommit(
  client: AbyssClient,
  payer: PublicKey,
  fee?: FeeOptions,
): Promise<{ mintIndex: bigint; request: PublicKey; tx: VersionedTransaction }> {
  const mintIndex = BigInt((await client.pool()).mintedCount.toString());
  const nonce = randomNonce();
  const request = oraoRequest(mintSeed(mintIndex, payer, Uint8Array.from(nonce)));
  const ix = await client.mintCommitIx(payer, nonce, mintIndex);
  return { mintIndex, request, tx: await client.tx(payer, [ix], MEASURED_CU.mintCommit, fee) };
}

/**
 * Reveals a pending mint once ORAO has fulfilled it. Anyone may send it (the caller is reimbursed
 * rent). With no fulfilment REVEAL_TIMEOUT after commit, it settles at the lowest tier instead.
 */
export async function prepareMintReveal(
  client: AbyssClient,
  cranker: PublicKey,
  mintIndex: bigint,
  { waitMs = 90_000, fee }: { waitMs?: number; fee?: FeeOptions } = {},
): Promise<VersionedTransaction> {
  const pending = await client.pendingMint(mintIndex);
  if (!pending) throw new Error(`no pending mint #${mintIndex}`);
  const fulfilled = await waitForFulfillment(client.connection, pending.randomness, { timeoutMs: waitMs });
  if (!fulfilled && !fallbackAvailable(pending.committedAt.toNumber())) {
    throw new Error('randomness not fulfilled yet; retry, or wait for the 1 h fallback');
  }
  const ix = await client.mintRevealIx(cranker, mintIndex, pending.payer, pending.randomness);
  return client.tx(cranker, [ix], MEASURED_CU.mintReveal, fee);
}

export async function prepareExpeditionReturnCommit(
  client: AbyssClient,
  owner: PublicKey,
  asset: PublicKey,
  fee?: FeeOptions,
): Promise<{ request: PublicKey; tx: VersionedTransaction }> {
  const sub = await client.sub(asset);
  if (!sub) throw new Error('unknown sub');
  const nonce = randomNonce();
  const request = oraoRequest(expeditionSeed(client.pda.sub(asset), BigInt(sub.awayUntil.toString()), Uint8Array.from(nonce)));
  const ix = await client.expeditionReturnCommitIx(owner, asset, nonce, BigInt(sub.awayUntil.toString()));
  return { request, tx: await client.tx(owner, [ix], MEASURED_CU.expeditionReturnCommit, fee) };
}

export async function prepareExpeditionReturnReveal(
  client: AbyssClient,
  cranker: PublicKey,
  asset: PublicKey,
  { waitMs = 90_000, fee }: { waitMs?: number; fee?: FeeOptions } = {},
): Promise<VersionedTransaction> {
  const sub = await client.sub(asset);
  if (!sub) throw new Error('unknown sub');
  const harbor = await client.program.account.harbor.fetch(sub.harbor);
  const fulfilled = await waitForFulfillment(client.connection, sub.randomness, { timeoutMs: waitMs });
  if (!fulfilled && !fallbackAvailable(sub.committedAt.toNumber())) {
    throw new Error('randomness not fulfilled yet; retry, or wait for the 1 h fallback');
  }
  const ix = await client.expeditionReturnRevealIx(cranker, asset, harbor.owner, sub.randomness);
  return client.tx(cranker, [ix], MEASURED_CU.expeditionReturnReveal, fee);
}

/** True once a commitment made at `committedAt` may settle via the no-fulfilment fallback. */
export const fallbackAvailable = (committedAt: number, now = Math.floor(Date.now() / 1000)) =>
  now >= committedAt + REVEAL_TIMEOUT;
