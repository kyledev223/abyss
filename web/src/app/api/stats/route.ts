import { currentPayoutPerDay, toRewardState } from "@abyss-haul/client";
import { programReady, serverClient } from "@/lib/server/chain";

export const dynamic = "force-dynamic";

export interface Stats {
  ready: boolean;
  paidOut: string;
  unclaimed: string;
  inStream: string;
  streamEnd: number;
  payoutPerDay: number;
  totalSubs: number;
  activePlayers: number;
  totalDepth: string;
  windowSeconds: number;
  mintPrice: string;
  poolBps: number;
  totalFees: string;
  paused: { mint: boolean; upgrades: boolean };
  asOf: number;
}

/** Live pool numbers for the landing page and harbor. */
export async function GET() {
  if (!(await programReady())) return Response.json({ ready: false });
  const client = serverClient();
  const [config, pool] = await Promise.all([client.config(), client.pool()]);
  const r = toRewardState(pool.rewards as never);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const stats: Stats = {
    ready: true,
    paidOut: r.totalClaimed.toString(),
    unclaimed: (r.totalCredited - r.totalClaimed).toString(),
    inStream: r.streamRemaining.toString(),
    streamEnd: Number(r.streamEnd),
    payoutPerDay: currentPayoutPerDay(r, now),
    totalSubs: pool.liveSubs,
    activePlayers: pool.activeHarbors,
    totalDepth: r.totalDepth.toString(),
    windowSeconds: config.params.window.toNumber(),
    mintPrice: config.params.mintPrice.toString(),
    poolBps: config.params.poolBps,
    totalFees: pool.totalFees.toString(),
    paused: { mint: config.pausedMint, upgrades: config.pausedUpgrades },
    asOf: Number(now),
  };
  return Response.json(stats, { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=30" } });
}
