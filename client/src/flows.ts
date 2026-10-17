/**
 * Multi-step player flows. Each returns unsigned transactions plus any extra keypair signers, so the
 * same code serves a browser wallet, scripts and the keeper.
 */
import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import type { AbyssClient } from './client';
import { MEASURED_CU, REVEAL_TIMEOUT, SWITCHBOARD_CU } from './constants';
import type { FeeOptions } from './fees';
import {
  createRandomnessIx,
  randomnessCommitIx,
  randomnessInUse,
  randomnessRevealIx,
  type SwitchboardCtx,
} from './switchboard';

export interface Prepared {
  tx: VersionedTransaction;
  /** Keypairs that must co-sign besides the fee payer / wallet. */
  signers: Keypair[];
}

/** A randomness account the player can commit now: `existing` if free, otherwise a new one to create. */
export async function prepareRandomness(
  client: AbyssClient,
  ctx: SwitchboardCtx,
  payer: PublicKey,
  existing?: PublicKey,
  fee?: FeeOptions,
): Promise<{ address: PublicKey; create?: Prepared }> {
  if (existing && !(await randomnessInUse(client, existing))) return { address: existing };
  const { keypair, address, ix } = await createRandomnessIx(ctx, payer);
  const tx = await client.tx(payer, [ix], SWITCHBOARD_CU, fee);
  return { address, create: { tx, signers: [keypair] } };
}

/**
 * Pays for a mint and commits the randomness. If another mint lands first the mint index moves and
 * the transaction fails harmlessly; call again to rebuild with the new index.
 */
export async function prepareMintCommit(
  client: AbyssClient,
  ctx: SwitchboardCtx,
  payer: PublicKey,
  randomness: PublicKey,
  fee?: FeeOptions,
): Promise<{ mintIndex: bigint; commit: Prepared }> {
  const mintIndex = BigInt((await client.pool()).mintedCount.toString());
  const ixs = [await randomnessCommitIx(ctx, randomness, payer), await client.mintCommitIx(payer, randomness, mintIndex)];
  return { mintIndex, commit: { tx: await client.tx(payer, ixs, MEASURED_CU.mintCommit + SWITCHBOARD_CU, fee), signers: [] } };
}

/**
 * Reveals a pending mint. Anyone may send it (the caller is reimbursed rent). After REVEAL_TIMEOUT
 * with no reveal, pass `fallback: true` to settle at the lowest tier without Switchboard.
 */
export async function prepareMintReveal(
  client: AbyssClient,
  ctx: SwitchboardCtx | undefined,
  cranker: PublicKey,
  mintIndex: bigint,
  { fallback = false, fee }: { fallback?: boolean; fee?: FeeOptions } = {},
): Promise<Prepared> {
  const pending = await client.pendingMint(mintIndex);
  if (!pending) throw new Error(`no pending mint #${mintIndex}`);
  const ixs = [];
  if (!fallback) {
    if (!ctx) throw new Error('Switchboard context required unless fallback');
    ixs.push(await randomnessRevealIx(ctx, pending.randomness, cranker));
  }
  ixs.push(await client.mintRevealIx(cranker, mintIndex, pending.payer, pending.randomness));
  const cu = MEASURED_CU.mintReveal + (fallback ? 0 : SWITCHBOARD_CU);
  return { tx: await client.tx(cranker, ixs, cu, fee), signers: [] };
}

export async function prepareExpeditionReturnCommit(
  client: AbyssClient,
  ctx: SwitchboardCtx,
  owner: PublicKey,
  asset: PublicKey,
  randomness: PublicKey,
  fee?: FeeOptions,
): Promise<Prepared> {
  const ixs = [await randomnessCommitIx(ctx, randomness, owner), await client.expeditionReturnCommitIx(owner, asset, randomness)];
  return { tx: await client.tx(owner, ixs, MEASURED_CU.expeditionReturnCommit + SWITCHBOARD_CU, fee), signers: [] };
}

export async function prepareExpeditionReturnReveal(
  client: AbyssClient,
  ctx: SwitchboardCtx | undefined,
  cranker: PublicKey,
  asset: PublicKey,
  { fallback = false, fee }: { fallback?: boolean; fee?: FeeOptions } = {},
): Promise<Prepared> {
  const sub = await client.sub(asset);
  if (!sub) throw new Error('unknown sub');
  const harbor = await client.program.account.harbor.fetch(sub.harbor);
  const ixs = [];
  if (!fallback) {
    if (!ctx) throw new Error('Switchboard context required unless fallback');
    ixs.push(await randomnessRevealIx(ctx, sub.randomness, cranker));
  }
  ixs.push(await client.expeditionReturnRevealIx(cranker, asset, harbor.owner, sub.randomness));
  const cu = MEASURED_CU.expeditionReturnReveal + (fallback ? 0 : SWITCHBOARD_CU);
  return { tx: await client.tx(cranker, ixs, cu, fee), signers: [] };
}

/** True once a commitment made at `committedAt` may settle via the no-reveal fallback. */
export const fallbackAvailable = (committedAt: number, now = Math.floor(Date.now() / 1000)) =>
  now >= committedAt + REVEAL_TIMEOUT;
