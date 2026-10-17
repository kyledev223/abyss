"use client";

import { useMemo, useState } from "react";
import { explorerAddress, explorerTx } from "@/lib/config";
import { ago, short, sol } from "@/lib/format";
import { useFleet, useNow, usePoll, useStats } from "@/lib/hooks";
import type { DecodedEvent } from "@/lib/server/events";

const TIERS = ["Rust Bucket", "Reef Runner", "Kelp Cutter", "Trench Diver", "Leviathan", "The Abyssal One"];
const STATE_LABEL = { idle: "In a wallet", docked: "Docked", away: "On an expedition", returning: "Returning" } as const;

function Page({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="py-12">
      <h1 className="text-6xl">{title}</h1>
      <p className="mt-4 max-w-2xl text-lg text-silt">{intro}</p>
      <div className="mt-10">{children}</div>
    </div>
  );
}

function NotLive() {
  return <p className="text-silt">The program isn&apos;t live on this network yet.</p>;
}

// ------------------------------------------------------------------------------------------ fleet

export function FleetRegistry() {
  const { data } = useFleet();
  const [tier, setTier] = useState<number | "all">("all");
  const subs = useMemo(() => (data?.subs ?? []).filter((s) => tier === "all" || s.tier === tier), [data, tier]);
  return (
    <Page title="Fleet" intro="Every sub in the water and in wallets, newest first. Art is drawn from each sub's on-chain stats.">
      {!data ? (
        <p className="text-silt">Loading the fleet…</p>
      ) : !data.ready ? (
        <NotLive />
      ) : (
        <>
          <div role="group" aria-label="Filter by tier" className="mb-6 flex flex-wrap gap-2">
            {(["all", 0, 1, 2, 3, 4, 5] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                aria-pressed={tier === t}
                className={`h-9 rounded-full border px-4 text-sm ${tier === t ? "border-plankton text-plankton" : "border-kelp text-silt hover:text-foam"}`}
              >
                {t === "all" ? `All (${data.subs.length})` : TIERS[t]}
              </button>
            ))}
          </div>
          {subs.length === 0 ? (
            <p className="text-silt">No subs here yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead className="text-sm text-silt">
                  <tr className="border-b border-kelp">
                    <th scope="col" className="py-2 font-normal">Sub</th>
                    <th scope="col" className="py-2 text-right font-normal">Depth Rating</th>
                    <th scope="col" className="py-2 text-right font-normal">Level</th>
                    <th scope="col" className="py-2 font-normal">Where</th>
                    <th scope="col" className="py-2 font-normal">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.slice(0, 300).map((s) => (
                    <tr key={s.asset} className="border-b border-kelp/50">
                      <td className="py-2">
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/art/${s.asset}`} alt="" width={48} height={48} className="rounded-md" loading="lazy" />
                          <a href={explorerAddress(s.asset)} target="_blank" rel="noreferrer" className="no-underline hover:underline">
                            <span className="font-bold">{s.tierName}</span> <span className="text-silt">#{s.mintIndex + 1}</span>
                          </a>
                        </div>
                      </td>
                      <td className="py-2 text-right">{s.depth.toLocaleString("en-US")}</td>
                      <td className="py-2 text-right">{s.level}</td>
                      <td className="py-2">{STATE_LABEL[s.state]}</td>
                      <td className="py-2 text-silt">{s.owner ? short(s.owner) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

// ------------------------------------------------------------------------------------------ leaderboard

export function Leaderboard() {
  const { data } = useFleet();
  const { data: stats } = useStats();
  const total = stats && "totalDepth" in stats ? Number(stats.totalDepth) : 0;
  const now = useNow(60_000);
  const rows = useMemo(
    () =>
      (data?.harbors ?? [])
        .map((h) => ({ ...h, live: h.depth + (h.boostEndHour * 3600 > now ? h.boostExtra : 0) }))
        .filter((h) => h.live > 0)
        .sort((a, b) => b.live - a.live)
        .slice(0, 100),
    [data, now],
  );
  return (
    <Page title="Leaderboard" intro="Harbors ranked by the Depth Rating they have docked right now, including any active expedition boost.">
      {!data ? (
        <p className="text-silt">Loading harbors…</p>
      ) : !data.ready ? (
        <NotLive />
      ) : rows.length === 0 ? (
        <p className="text-silt">No harbors have subs docked yet.</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead className="text-sm text-silt">
            <tr className="border-b border-kelp">
              <th scope="col" className="py-2 font-normal">Rank</th>
              <th scope="col" className="py-2 font-normal">Harbor owner</th>
              <th scope="col" className="py-2 text-right font-normal">Docked</th>
              <th scope="col" className="py-2 text-right font-normal">Depth Rating</th>
              <th scope="col" className="py-2 text-right font-normal">Share of fleet</th>
              <th scope="col" className="hidden py-2 text-right font-normal sm:table-cell">Claimed so far</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => (
              <tr key={h.address} className="border-b border-kelp/50">
                <td className="py-3 font-display text-2xl">{i + 1}</td>
                <td className="py-3">
                  <a href={explorerAddress(h.owner)} target="_blank" rel="noreferrer" className="no-underline hover:underline">
                    {short(h.owner, 5)}
                  </a>
                </td>
                <td className="py-3 text-right">
                  {h.docked} / {h.slots}
                </td>
                <td className="py-3 text-right font-bold">{h.live.toLocaleString("en-US")}</td>
                <td className="py-3 text-right">{total ? `${((h.live / total) * 100).toFixed(2)}%` : "–"}</td>
                <td className="hidden py-3 text-right text-silt sm:table-cell">{sol(h.totalClaimed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Page>
  );
}

// ------------------------------------------------------------------------------------------ ledger

function describe(e: DecodedEvent): { what: string; amount?: string; out?: boolean } {
  const d = e.data as Record<string, string & { [k: string]: unknown }>;
  switch (e.name) {
    case "feePaid": {
      const kind = Object.keys(d.kind as object)[0];
      const label = { mint: "Mint fee", reinforce: "Reinforce fee", merge: "Merge fee", harborSlot: "Dock slot fee" }[kind] ?? "Fee";
      return { what: `${label}: ${sol(d.toPool)} to the pool, ${sol(d.toTreasury)} to the treasury`, amount: sol(d.amount), out: true };
    }
    case "poolFunded":
      return { what: "Pool funded directly (100% to players)", amount: sol(d.amount) };
    case "claimed":
      return { what: "Claimed from the pool", amount: sol(d.amount) };
    case "subMinted":
      return { what: `Minted ${TIERS[Number(d.tier)]} #${Number(d.mintIndex) + 1}${d.fallback ? " (randomness timed out)" : ""}` };
    case "mintCommitted":
      return { what: `Paid for mint #${Number(d.mintIndex) + 1}, waiting for randomness` };
    case "docked":
      return { what: `Docked a sub (Depth Rating ${d.depth})` };
    case "undocked":
      return { what: `Undocked a sub (Depth Rating ${d.depth})` };
    case "reinforced":
      return { what: `Reinforced a hull to level ${d.level}` };
    case "merged":
      return { what: `Merged two subs into ${TIERS[Number(d.tier)]}` };
    case "harborExpanded":
      return { what: `Harbor grew to ${d.slots} slots` };
    case "expeditionStarted":
      return { what: `Sent a sub away for ${d.hours} h` };
    case "expeditionReturned": {
      const o = Object.keys(d.outcome as object)[0];
      return { what: `Expedition returned: ${o === "boost" ? "depth boost" : o === "barnacle" ? "a barnacle" : "nothing"}` };
    }
    case "pauseSet":
      return { what: `Admin set pause: minting ${d.mint ? "paused" : "open"}, upgrades ${d.upgrades ? "paused" : "open"}` };
    case "configUpdated":
      return { what: "Admin updated the settings" };
    default:
      return { what: e.name };
  }
}

export function Ledger() {
  const [filter, setFilter] = useState<string>("");
  const { data } = usePoll<{ ready: boolean; source: string; events: DecodedEvent[] }>(`/api/ledger?limit=150${filter ? `&name=${filter}` : ""}`, 20_000);
  const FILTERS = [
    ["", "Everything"],
    ["feePaid", "Fees"],
    ["claimed", "Claims"],
    ["subMinted", "Mints"],
    ["poolFunded", "Pool funding"],
  ];
  return (
    <Page title="Ledger" intro="Every fee that went into the pool and every claim that came out, decoded from on-chain events. Amounts in amber left a player's wallet.">
      <div role="group" aria-label="Filter events" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            aria-pressed={filter === k}
            className={`h-9 rounded-full border px-4 text-sm ${filter === k ? "border-plankton text-plankton" : "border-kelp text-silt hover:text-foam"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {!data ? (
        <p className="text-silt">Reading the ledger…</p>
      ) : !data.ready ? (
        <NotLive />
      ) : data.events.length === 0 ? (
        <p className="text-silt">Nothing recorded yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-kelp/60 border-y border-kelp/60">
            {data.events.map((e) => {
              const d = describe(e);
              return (
                <li key={`${e.signature}-${e.eventIndex}`} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-3">
                  <span className="flex-1">{d.what}</span>
                  {d.amount && <span className={d.out ? "text-lantern" : "text-plankton"}>{d.amount}</span>}
                  <a href={explorerTx(e.signature)} target="_blank" rel="noreferrer" className="w-28 text-right text-sm text-silt hover:text-foam">
                    {ago(e.blockTime)}
                  </a>
                </li>
              );
            })}
          </ul>
          {data.source === "rpc" && <p className="mt-4 text-sm text-silt">Showing the most recent transactions read straight from the network.</p>}
        </>
      )}
    </Page>
  );
}
