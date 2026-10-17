/**
 * Decodes the program's `emit_cpi!` events from a transaction. Each event is an inner instruction to
 * our program whose data is EVENT_IX_TAG ‖ event discriminator ‖ borsh fields. Works on both
 * `getTransaction` (json encoding) results and Helius "raw" webhook payloads, which share a shape.
 */
import { utils } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { serverClient } from "./chain";

const EVENT_IX_TAG = Buffer.from([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d]);

export interface RawTx {
  slot: number;
  blockTime?: number | null;
  meta: {
    err: unknown;
    innerInstructions?: { index: number; instructions: { programIdIndex: number; data: string }[] }[] | null;
    loadedAddresses?: { writable: string[]; readonly: string[] } | null;
  } | null;
  transaction: { signatures: string[]; message: { accountKeys: (string | { pubkey: string })[] } };
}

export interface DecodedEvent {
  signature: string;
  eventIndex: number;
  slot: number;
  blockTime: number | null;
  name: string;
  data: Record<string, unknown>;
}

/** BN → string, PublicKey → base58, enums kept as { variant: {...} }. */
function plain(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof PublicKey) return v.toBase58();
  if (typeof v === "object" && "toArrayLike" in (v as object) && "toString" in (v as object)) return (v as { toString(): string }).toString();
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "object") return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, plain(x)]));
  return v;
}

export function decodeEvents(tx: RawTx): DecodedEvent[] {
  if (!tx.meta || tx.meta.err) return [];
  const client = serverClient();
  const programId = client.program.programId.toBase58();
  const keys = [
    ...tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey)),
    ...(tx.meta.loadedAddresses?.writable ?? []),
    ...(tx.meta.loadedAddresses?.readonly ?? []),
  ];
  const out: DecodedEvent[] = [];
  let eventIndex = 0;
  for (const group of tx.meta.innerInstructions ?? []) {
    for (const ix of group.instructions) {
      if (keys[ix.programIdIndex] !== programId) continue;
      const data = Buffer.from(utils.bytes.bs58.decode(ix.data));
      if (data.length < 16 || !data.subarray(0, 8).equals(EVENT_IX_TAG)) continue;
      const event = client.program.coder.events.decode(data.subarray(8).toString("base64"));
      if (!event) continue;
      out.push({
        signature: tx.transaction.signatures[0],
        eventIndex: eventIndex++,
        slot: tx.slot,
        blockTime: tx.blockTime ?? null,
        name: event.name,
        data: plain(event.data) as Record<string, unknown>,
      });
    }
  }
  return out;
}

/** Recent events straight from the RPC; the fallback when no database is configured. */
export async function recentEventsFromRpc(limit = 25): Promise<DecodedEvent[]> {
  const client = serverClient();
  const sigs = await client.connection.getSignaturesForAddress(client.program.programId, { limit });
  const txs = await client.connection.getTransactions(
    sigs.filter((s) => !s.err).map((s) => s.signature),
    { maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  );
  const events: DecodedEvent[] = [];
  for (const tx of txs) {
    if (!tx) continue;
    const raw: RawTx = {
      slot: tx.slot,
      blockTime: tx.blockTime,
      meta: {
        err: tx.meta?.err ?? null,
        innerInstructions: tx.meta?.innerInstructions?.map((g) => ({
          index: g.index,
          instructions: g.instructions.map((i) => ({ programIdIndex: i.programIdIndex, data: i.data })),
        })),
        loadedAddresses: tx.meta?.loadedAddresses
          ? {
              writable: tx.meta.loadedAddresses.writable.map((k) => k.toBase58()),
              readonly: tx.meta.loadedAddresses.readonly.map((k) => k.toBase58()),
            }
          : null,
      },
      transaction: {
        signatures: tx.transaction.signatures,
        message: { accountKeys: tx.transaction.message.staticAccountKeys.map((k) => k.toBase58()) },
      },
    };
    events.push(...decodeEvents(raw));
  }
  return events;
}
