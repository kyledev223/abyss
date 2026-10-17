import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

export interface FeeOptions {
  /** Fixed priority fee in micro-lamports per CU; skips estimation. */
  microLamports?: number;
  /**
   * Our Next.js route that proxies Helius `getPriorityFeeEstimate` (keeps HELIUS_API_KEY server-side).
   * POST { accountKeys: string[] } → { microLamports: number }.
   */
  priorityFeeUrl?: string;
  /** Percentile of recent fees when falling back to the RPC (default 75). */
  percentile?: number;
}

/** Headroom over measured compute units. */
export const CU_HEADROOM = 1.3;
const MIN_PRIORITY = 1_000;
const MAX_PRIORITY = 5_000_000;

export function writableKeys(ixs: TransactionInstruction[]): PublicKey[] {
  const seen = new Map<string, PublicKey>();
  for (const ix of ixs) for (const k of ix.keys) if (k.isWritable) seen.set(k.pubkey.toBase58(), k.pubkey);
  return [...seen.values()];
}

export async function estimatePriorityFee(
  connection: Connection,
  writable: PublicKey[],
  opts: FeeOptions = {},
): Promise<number> {
  if (opts.microLamports !== undefined) return opts.microLamports;
  const clamp = (n: number) => Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, Math.ceil(n)));
  if (opts.priorityFeeUrl) {
    try {
      const res = await fetch(opts.priorityFeeUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountKeys: writable.map((k) => k.toBase58()) }),
      });
      if (res.ok) return clamp((await res.json()).microLamports);
    } catch {
      // fall through to the RPC estimate
    }
  }
  const recent = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: writable });
  const fees = recent.map((f) => f.prioritizationFee).filter((f) => f > 0).sort((a, b) => a - b);
  if (fees.length === 0) return MIN_PRIORITY;
  const p = (opts.percentile ?? 75) / 100;
  return clamp(fees[Math.min(fees.length - 1, Math.floor(p * fees.length))]);
}

/** Compute-unit limit (measured × headroom) and priority fee, prepended to every transaction. */
export function computeBudgetIxs(measuredUnits: number, microLamports: number): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: Math.min(1_400_000, Math.ceil(measuredUnits * CU_HEADROOM)) }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ];
}

export function compileTx(
  payer: PublicKey,
  ixs: TransactionInstruction[],
  measuredUnits: number,
  microLamports: number,
  recentBlockhash: string,
): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash,
    instructions: [...computeBudgetIxs(measuredUnits, microLamports), ...ixs],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}
