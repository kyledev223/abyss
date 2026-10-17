"use client";

import { AbyssClient } from "@abyss-haul/client";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { VersionedTransaction } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Stats } from "@/app/api/stats/route";
import { CLUSTER } from "@/lib/config";
import type { FleetHarbor, FleetSub } from "@/lib/server/chain";

/** Polls a JSON endpoint; `refresh()` refetches immediately (e.g. after a transaction). */
export function usePoll<T>(url: string | null, everyMs = 15_000) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | undefined>();
  const tick = useRef(0);
  const load = useCallback(
    async (bust = false) => {
      if (!url) return;
      const id = ++tick.current;
      try {
        const res = await fetch(bust ? `${url}${url.includes("?") ? "&" : "?"}fresh` : url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = (await res.json()) as T;
        if (id === tick.current) {
          setData(json);
          setError(undefined);
        }
      } catch (e) {
        if (id === tick.current) setError(String(e));
      }
    },
    [url],
  );
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, everyMs]);
  return { data, error, refresh: () => load(true) };
}

export const useStats = () => usePoll<Stats | { ready: false }>("/api/stats", 15_000);

export interface FleetResponse {
  ready: boolean;
  subs: FleetSub[];
  harbors: FleetHarbor[];
  asOf?: number;
}
export const useFleet = (owner?: string | null) =>
  usePoll<FleetResponse>(owner === null ? null : owner ? `/api/fleet?owner=${owner}` : "/api/fleet", 20_000);

/** Program client on the browser connection, with its addresses loaded. */
export function useAbyssClient() {
  const { connection } = useConnection();
  const client = useMemo(() => new AbyssClient(connection, CLUSTER), [connection]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    client
      .load()
      .then(() => live && setReady(true))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [client]);
  return { client, ready, error };
}

export type TxStatus =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "done"; message: string; signature?: string }
  | { kind: "failed"; message: string };

/** Signs with the connected wallet, sends, and waits for confirmation. */
export function useSender() {
  const { connection } = useConnection();
  const { sendTransaction, publicKey } = useWallet();
  const [status, setStatus] = useState<TxStatus>({ kind: "idle" });

  const send = useCallback(
    async (tx: VersionedTransaction) => {
      const signature = await sendTransaction(tx, connection, { maxRetries: 5 });
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const res = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      if (res.value.err) throw new Error(`Transaction failed on chain: ${JSON.stringify(res.value.err)}`);
      return signature;
    },
    [connection, sendTransaction],
  );

  /** Runs a multi-step action, keeping `status` up to date. */
  const run = useCallback(
    async (fn: (step: (label: string) => void) => Promise<{ message: string; signature?: string }>) => {
      try {
        setStatus({ kind: "working", step: "Preparing" });
        const done = await fn((label) => setStatus({ kind: "working", step: label }));
        setStatus({ kind: "done", ...done });
        return true;
      } catch (e) {
        setStatus({ kind: "failed", message: friendlyError(e) });
        return false;
      }
    },
    [],
  );

  return { publicKey, send, run, status, reset: () => setStatus({ kind: "idle" }) };
}

/** Wallet and program errors in plain language. */
export function friendlyError(e: unknown): string {
  const s = String((e as { message?: string })?.message ?? e);
  if (/User rejected|rejected the request/i.test(s)) return "You declined the transaction in your wallet. Nothing was sent.";
  if (/insufficient (funds|lamports)|0x1\b/i.test(s)) return "Your wallet doesn't have enough SOL for this, including network fees.";
  const anchor = s.match(/Error Message: ([^.]+)\./);
  if (anchor) return `${anchor[1]}.`;
  if (/blockhash not found|expired/i.test(s)) return "The network took too long to confirm. Check your wallet history, then try again.";
  return s.length > 220 ? `${s.slice(0, 220)}…` : s;
}

/** Re-renders every `ms` (for live countdowns and ticking balances). */
export function useNow(ms = 1_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
