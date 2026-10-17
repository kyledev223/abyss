"use client";

import {
  estimateRatePerDepthDay,
  fetchOraoNetwork,
  launchParams,
  paybackDays,
  toRewardState,
  type AbyssClient,
} from "@abyss-haul/client";
import { useEffect, useState } from "react";

/** Live params and pool state, falling back to launch defaults before the program exists. */
export interface Economy {
  live: boolean;
  params: ReturnType<typeof launchParams>;
  paused: { mint: boolean; upgrades: boolean };
  pool?: ReturnType<typeof toRewardState>;
  ratePerDepthDay: number;
  oraoFee: bigint;
  oraoRequestRent: bigint;
  subAccountsRent: bigint;
}

/** ORAO RandomnessV2 pending account: 8 + 1 + 32 + 32 + 4 + 7 × 96 bytes. */
const ORAO_REQUEST_SPACE = 749;
/** Sub account (8 + 175) plus a Core asset with one plugin (~330 bytes, measured). */
const SUB_SPACE = 183;
const CORE_ASSET_SPACE = 330;

export function useEconomy(client: AbyssClient, ready: boolean, trailing24hPayout?: number): Economy | undefined {
  const [eco, setEco] = useState<Economy>();
  useEffect(() => {
    let live = true;
    const load = async () => {
      const conn = client.connection;
      const [orao, reqRent, subRent, assetRent] = await Promise.all([
        fetchOraoNetwork(conn).catch(() => ({ requestFee: 500_000n })),
        conn.getMinimumBalanceForRentExemption(ORAO_REQUEST_SPACE),
        conn.getMinimumBalanceForRentExemption(SUB_SPACE),
        conn.getMinimumBalanceForRentExemption(CORE_ASSET_SPACE),
      ]);
      let params = launchParams();
      let paused = { mint: false, upgrades: false };
      let pool: Economy["pool"];
      let rate = 0;
      if (ready) {
        const [c, p] = await Promise.all([client.config(), client.pool()]);
        params = c.params as never;
        paused = { mint: c.pausedMint, upgrades: c.pausedUpgrades };
        pool = toRewardState(p.rewards as never);
        rate = estimateRatePerDepthDay(pool, BigInt(Math.floor(Date.now() / 1000)), trailing24hPayout);
      }
      if (live)
        setEco({
          live: ready,
          params,
          paused,
          pool,
          ratePerDepthDay: rate,
          oraoFee: BigInt(orao.requestFee.toString()),
          oraoRequestRent: BigInt(reqRent),
          subAccountsRent: BigInt(subRent + assetRent),
        });
    };
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [client, ready, trailing24hPayout]);
  return eco;
}

/** Expected Depth Rating of one mint at the given odds. */
export function expectedDepth(params: Economy["params"]): number {
  return params.tierOddsBps.reduce((s, odds, i) => s + (odds / 10_000) * Number(params.tierDepth[i].toString()), 0);
}

export function payback(cost: bigint, depthGain: number, eco: Economy | undefined) {
  if (!eco?.live) return "never" as const;
  return paybackDays(cost, BigInt(Math.round(depthGain)), eco.ratePerDepthDay);
}
