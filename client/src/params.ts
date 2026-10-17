import { BN } from '@anchor-lang/core';
import defaults from '../../config/defaults.json';

/** On-chain `Params`, in the IDL's camelCase shape. */
export interface Params {
  mintPrice: BN;
  poolBps: number;
  window: BN;
  tierOddsBps: number[];
  tierDepth: BN[];
  reinforceBpsPerLevel: number;
  reinforceMaxLevel: number;
  reinforceLamportsPerDepth: BN;
  reinforceGrowthBps: number;
  mergeFee: BN[];
  harborStartSlots: number;
  harborMaxSlots: number;
  slotBaseLamports: BN;
  slotGrowthBps: number;
  maxLiveSubs: number;
  expeditionBoostBps: number;
  expeditionBoostHoursPerHour: number;
  expeditionBoostChanceBps: number;
  expeditionBarnacleChanceBps: number;
}

export const TIER_NAMES: string[] = defaults.tiers.map((t) => t.name);

/** Launch parameters from config/defaults.json, the single source of truth. */
export function launchParams(): Params {
  const d = defaults;
  return {
    mintPrice: new BN(d.mintPriceLamports),
    poolBps: d.poolBps,
    window: new BN(d.windowSeconds),
    tierOddsBps: d.tiers.map((t) => t.oddsBps),
    tierDepth: d.tiers.map((t) => new BN(t.depth)),
    reinforceBpsPerLevel: d.reinforce.bpsPerLevel,
    reinforceMaxLevel: d.reinforce.maxLevel,
    reinforceLamportsPerDepth: new BN(d.reinforce.lamportsPerBaseDepth),
    reinforceGrowthBps: d.reinforce.growthBps,
    mergeFee: d.mergeFeeLamports.map((f) => new BN(f)),
    harborStartSlots: d.harbor.startSlots,
    harborMaxSlots: d.harbor.maxSlots,
    slotBaseLamports: new BN(d.harbor.baseLamports),
    slotGrowthBps: d.harbor.growthBps,
    maxLiveSubs: d.maxLiveSubs,
    expeditionBoostBps: d.expedition.boostBps,
    expeditionBoostHoursPerHour: d.expedition.boostHoursPerHour,
    expeditionBoostChanceBps: d.expedition.boostChanceBps,
    expeditionBarnacleChanceBps: d.expedition.barnacleChanceBps,
  };
}
