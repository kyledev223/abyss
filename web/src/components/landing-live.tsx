"use client";

import Link from "next/link";
import type { Stats } from "@/app/api/stats/route";
import { Sonar } from "@/components/sonar";
import { ago, duration, short, sol } from "@/lib/format";
import { useFleet, usePoll, useStats } from "@/lib/hooks";
import type { DecodedEvent } from "@/lib/server/events";

const TIERS = ["Rust Bucket", "Reef Runner", "Kelp Cutter", "Trench Diver", "Leviathan", "The Abyssal One"];

export function Hero() {
  const fleet = useFleet();
  const { data: stats } = useStats();
  const live = stats && "paidOut" in stats ? stats : undefined;
  return (
    <section id="surface" className="grid items-center gap-10 py-12 md:grid-cols-[1.35fr_1fr] md:py-20">
      <div>
        <h1 className="font-stencil text-[clamp(2.6rem,4.5vw,4.1rem)] font-extrabold leading-[0.95] tracking-wide">
          Send subs down.
          <br />
          Haul up the pool.
        </h1>
        <p className="mt-6 max-w-[36rem] text-lg text-silt">
          Mint a submarine and dock it in your harbor. Every mint and upgrade feeds a shared pool, and docked subs
          split what it pays out by Depth Rating. More subs in the water means a smaller share for each.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/shipyard"
            className="inline-flex h-12 items-center rounded-[var(--radius-hull)] bg-plankton px-6 text-lg font-bold text-abyss no-underline shadow-[0_0_28px_rgba(124,245,218,.3)] hover:bg-[#a6fbe7]"
          >
            Mint a sub
          </Link>
          <Link href="/docs#cohorts" className="text-foam underline decoration-kelp underline-offset-4 hover:decoration-silt">
            See who wins and who loses
          </Link>
        </div>
        {live && (
          <p className="mt-6 text-[0.95rem] text-silt">
            Mint price <span className="text-lantern">{sol(live.mintPrice)}</span>. {live.poolBps / 100}% goes to the
            pool, {100 - live.poolBps / 100}% to the treasury.
          </p>
        )}
      </div>
      <Sonar subs={fleet.data?.subs ?? []} loading={!fleet.data} />
    </section>
  );
}

export function PoolStats() {
  const { data } = useStats();
  if (!data) return <p className="text-silt">Reading the pool…</p>;
  if (!("paidOut" in data)) {
    return <p className="text-silt">The program isn&apos;t live on this network yet. Check back after launch.</p>;
  }
  const s = data as Stats;
  const streamLeft = Math.max(0, s.streamEnd - s.asOf);
  const items = [
    { label: "Paid out", value: sol(s.paidOut), note: "claimed by players so far" },
    { label: "Unclaimed", value: sol(s.unclaimed), note: "earned, waiting in harbors" },
    { label: "In the stream", value: sol(s.inStream), note: streamLeft ? `pays out over the next ${duration(streamLeft)}` : "nothing streaming right now" },
    { label: "Paying out", value: `${sol(s.payoutPerDay)} / day`, note: "at this moment, to all docked subs" },
    { label: "Subs in the fleet", value: s.totalSubs.toLocaleString("en-US"), note: `total Depth Rating ${Number(s.totalDepth).toLocaleString("en-US")}` },
    { label: "Active harbors", value: s.activePlayers.toLocaleString("en-US"), note: "with at least one sub docked" },
    { label: "Payout window", value: duration(s.windowSeconds), note: "each fee re-spreads the pool over this" },
  ];
  return (
    <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="border-l-2 border-kelp pl-4">
          <dt className="text-[0.95rem] text-silt">{i.label}</dt>
          <dd className="font-display text-3xl font-bold text-foam">{i.value}</dd>
          <dd className="text-sm text-silt">{i.note}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RecentMints() {
  const { data } = usePoll<{ ready: boolean; events: DecodedEvent[] }>("/api/ledger?name=subMinted&limit=10", 20_000);
  const events = data?.events ?? [];
  if (!data) return <p className="text-silt">Loading recent mints…</p>;
  if (events.length === 0) return <p className="text-silt">No subs minted yet. Yours could be the first in the water.</p>;
  return (
    <ul className="divide-y divide-kelp/60 border-y border-kelp/60">
      {events.map((e) => {
        const d = e.data as { asset: string; owner: string; tier: number; depth: string; mintIndex: string; fallback: boolean };
        return (
          <li key={`${e.signature}-${e.eventIndex}`} className="flex items-center gap-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/art/${d.asset}`} alt="" width={56} height={56} className="rounded-md" loading="lazy" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {TIERS[d.tier]} <span className="font-normal text-silt">#{Number(d.mintIndex) + 1}</span>
              </p>
              <p className="text-sm text-silt">
                Depth {d.depth}, minted by {short(d.owner)}
                {d.fallback && ", lowest tier after the randomness timed out"}
              </p>
            </div>
            <span className="text-sm whitespace-nowrap text-silt">{ago(e.blockTime)}</span>
          </li>
        );
      })}
    </ul>
  );
}
