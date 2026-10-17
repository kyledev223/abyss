/**
 * Switchboard On-Demand randomness, as the program expects it (DESIGN.md §7):
 *   1. create the randomness account (its own transaction, once; reusable),
 *   2. [switchboard commit, our *_commit] in one transaction,
 *   3. [switchboard reveal, our *_reveal] in one transaction, a slot or more later.
 *
 * Never re-commit a randomness account while a pending mint or a returning sub still points at it:
 * the program treats a re-commit as tampering and that commitment falls back to the worst outcome.
 * `randomnessInUse` checks this before reuse.
 */
import { Keypair, PublicKey, type Connection, type TransactionInstruction } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import { SWITCHBOARD_PROGRAM, type Cluster } from './constants';
import type { AbyssClient } from './client';

export interface SwitchboardCtx {
  program: Awaited<ReturnType<typeof sb.AnchorUtils.loadProgramFromConnection>>;
  queue: PublicKey;
}

export async function loadSwitchboard(connection: Connection, cluster: Exclude<Cluster, 'localnet'>): Promise<SwitchboardCtx> {
  const program = await sb.AnchorUtils.loadProgramFromConnection(connection as never, undefined, SWITCHBOARD_PROGRAM[cluster] as never);
  const queue = (cluster === 'devnet' ? sb.ON_DEMAND_DEVNET_QUEUE : sb.ON_DEMAND_MAINNET_QUEUE) as unknown as PublicKey;
  return { program, queue };
}

/** Instruction creating a new randomness account; `keypair` must co-sign. */
export async function createRandomnessIx(ctx: SwitchboardCtx, payer: PublicKey) {
  const keypair = Keypair.generate();
  const [, ix] = await sb.Randomness.create(ctx.program, keypair as never, ctx.queue as never, payer as never);
  return { keypair, address: keypair.publicKey, ix: ix as unknown as TransactionInstruction };
}

export async function randomnessCommitIx(ctx: SwitchboardCtx, randomness: PublicKey, authority: PublicKey) {
  const r = new sb.Randomness(ctx.program, randomness as never);
  return (await r.commitIx(ctx.queue as never, authority as never)) as unknown as TransactionInstruction;
}

/**
 * Asks the oracle gateway for the signed reveal. The gateway refuses until the seed slot has
 * passed, so this retries with a short backoff.
 */
export async function randomnessRevealIx(
  ctx: SwitchboardCtx,
  randomness: PublicKey,
  payer: PublicKey,
  { retries = 12, delayMs = 1_500 } = {},
): Promise<TransactionInstruction> {
  const r = new sb.Randomness(ctx.program, randomness as never);
  let last: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return (await r.revealIx(payer as never)) as unknown as TransactionInstruction;
    } catch (e) {
      last = e;
      await new Promise((ok) => setTimeout(ok, delayMs));
    }
  }
  throw new Error(`Switchboard reveal failed after ${retries} attempts: ${String(last)}`);
}

// Byte offsets of the `randomness` field (8-byte discriminator + preceding fixed-size fields).
const PENDING_RANDOMNESS_OFFSET = 8 + 32 + 8;
const SUB_RANDOMNESS_OFFSET = 8 + 32 + 8 + 1 + 1 + 8 + 8 + 2 + 1 + 32 + 8 + 1;

/** True if a pending mint or a sub awaiting its return roll still depends on `randomness`. */
export async function randomnessInUse(client: AbyssClient, randomness: PublicKey): Promise<boolean> {
  const filter = (offset: number) => [{ memcmp: { offset, bytes: randomness.toBase58() } }];
  const [pending, subs] = await Promise.all([
    client.program.account.pendingMint.all(filter(PENDING_RANDOMNESS_OFFSET)),
    client.program.account.sub.all(filter(SUB_RANDOMNESS_OFFSET)),
  ]);
  return pending.length > 0 || subs.some((s) => 'returning' in (s.account.state as object));
}
