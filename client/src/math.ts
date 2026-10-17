/**
 * Read-side port of programs/abyss-haul/src/rewards.rs and economics.rs, in BigInt, so the UI can
 * show exact pending rewards and prices without a transaction. Must stay in lockstep with the Rust;
 * client/test/client.test.ts checks pending previews against real claims.
 */
import type { BN } from '@anchor-lang/core';

export const ACC_PRECISION = 1_000_000_000_000n;
const HOUR = 3_600n;
const BOOST_RING = 32n;
const MAX_BOOST_HOURS_AHEAD = BOOST_RING - 1n;
const CHECKPOINT_RING = 720n;
const BPS = 10_000n;

const big = (v: BN | bigint | number) => (typeof v === 'bigint' ? v : BigInt(v.toString()));
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);
const divFloor = (a: bigint, b: bigint) => {
  const q = a / b;
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
};
const mod = (a: bigint, b: bigint) => ((a % b) + b) % b;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export interface RewardState {
  accPerDepth: bigint;
  totalDepth: bigint;
  streamRemaining: bigint;
  streamEnd: bigint;
  lastUpdate: bigint;
  totalDeposited: bigint;
  totalCredited: bigint;
  totalClaimed: bigint;
  boostAmount: bigint[];
  boostHour: bigint[];
}

export interface HarborRewards {
  depth: bigint;
  boostExtra: bigint;
  boostEndHour: bigint;
  accSnapshot: bigint;
  owed: bigint;
}

type AnyRecord = Record<string, BN | BN[] | number | bigint>;

/** From an Anchor-fetched `pool.rewards`. */
export function toRewardState(r: AnyRecord): RewardState {
  return {
    accPerDepth: big(r.accPerDepth as BN),
    totalDepth: big(r.totalDepth as BN),
    streamRemaining: big(r.streamRemaining as BN),
    streamEnd: big(r.streamEnd as BN),
    lastUpdate: big(r.lastUpdate as BN),
    totalDeposited: big(r.totalDeposited as BN),
    totalCredited: big(r.totalCredited as BN),
    totalClaimed: big(r.totalClaimed as BN),
    boostAmount: (r.boostAmount as BN[]).map(big),
    boostHour: (r.boostHour as BN[]).map(big),
  };
}

/** From an Anchor-fetched `harbor.rewards`. */
export function toHarborRewards(h: AnyRecord): HarborRewards {
  return {
    depth: big(h.depth as BN),
    boostExtra: big(h.boostExtra as BN),
    boostEndHour: big(h.boostEndHour as BN),
    accSnapshot: big(h.accSnapshot as BN),
    owed: big(h.owed as BN),
  };
}

/** Parsed `Checkpoints` zero-copy account: 8-byte discriminator, then 720 × (i64, u64, u64). */
export class Checkpoints {
  private hours: bigint[] = new Array(Number(CHECKPOINT_RING)).fill(0n);
  private accs: bigint[] = new Array(Number(CHECKPOINT_RING)).fill(0n);

  constructor(data?: Uint8Array) {
    if (!data) return;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < this.hours.length; i++) {
      const o = 8 + i * 24;
      this.hours[i] = view.getBigInt64(o, true);
      this.accs[i] = (view.getBigUint64(o + 16, true) << 64n) | view.getBigUint64(o + 8, true);
    }
  }

  record(hour: bigint, acc: bigint) {
    const i = Number(mod(hour, CHECKPOINT_RING));
    this.hours[i] = hour;
    this.accs[i] = acc;
  }

  get(hour: bigint): bigint | undefined {
    const i = Number(mod(hour, CHECKPOINT_RING));
    return this.hours[i] === hour ? this.accs[i] : undefined;
  }

  clone(): Checkpoints {
    const c = new Checkpoints();
    c.hours = [...this.hours];
    c.accs = [...this.accs];
    return c;
  }
}

const hourOf = (t: bigint) => divFloor(t, HOUR);

function credit(s: RewardState, released: bigint) {
  const delta = (released * ACC_PRECISION) / s.totalDepth;
  if (delta === 0n) return;
  const reserved = ceilDiv(delta * s.totalDepth, ACC_PRECISION);
  s.accPerDepth += delta;
  s.streamRemaining -= reserved;
  s.totalCredited += reserved;
}

function streamTo(s: RewardState, t: bigint) {
  if (t <= s.lastUpdate) return;
  if (s.totalDepth === 0n) {
    if (s.lastUpdate < s.streamEnd) s.streamEnd += t - s.lastUpdate;
  } else if (s.streamRemaining > 0n && s.lastUpdate < s.streamEnd) {
    const end = min(t, s.streamEnd);
    const released =
      end === s.streamEnd
        ? s.streamRemaining
        : (s.streamRemaining * (end - s.lastUpdate)) / (s.streamEnd - s.lastUpdate);
    credit(s, released);
  }
  s.lastUpdate = t;
}

/** Mutates `s` (pass a copy) up to `now`, exactly as the program's `accrue`. */
export function accrue(s: RewardState, now: bigint, cps: Checkpoints) {
  if (now <= s.lastUpdate) return;
  const first = hourOf(s.lastUpdate) + 1n;
  const last = min(hourOf(now), first - 1n + MAX_BOOST_HOURS_AHEAD);
  for (let hour = first; hour <= last; hour++) {
    const i = Number(mod(hour, BOOST_RING));
    if (s.boostHour[i] === hour && s.boostAmount[i] > 0n) {
      streamTo(s, hour * HOUR);
      s.totalDepth -= s.boostAmount[i];
      s.boostAmount[i] = 0n;
      cps.record(hour, s.accPerDepth);
    }
  }
  streamTo(s, now);
}

/** Mutates `h` (pass a copy) as the program's `settle`; `s` must already be accrued to `now`. */
export function settle(s: RewardState, h: HarborRewards, cps: Checkpoints) {
  const acc = s.accPerDepth;
  let earned: bigint;
  if (h.boostExtra > 0n && h.boostEndHour * HOUR <= s.lastUpdate) {
    const accEnd = cps.get(h.boostEndHour);
    earned =
      accEnd !== undefined && accEnd >= h.accSnapshot && accEnd <= acc
        ? (h.depth + h.boostExtra) * (accEnd - h.accSnapshot) + h.depth * (acc - accEnd)
        : h.depth * (acc - h.accSnapshot);
    h.boostExtra = 0n;
    h.boostEndHour = 0n;
  } else {
    earned = (h.depth + h.boostExtra) * (acc - h.accSnapshot);
  }
  h.owed += earned / ACC_PRECISION;
  h.accSnapshot = acc;
}

const cloneState = (s: RewardState): RewardState => ({
  ...s,
  boostAmount: [...s.boostAmount],
  boostHour: [...s.boostHour],
});

/** What a claim at `now` would pay (owed + pending), without changing anything. */
export function claimableAt(pool: RewardState, harbor: HarborRewards, now: bigint, checkpoints: Checkpoints): bigint {
  const s = cloneState(pool);
  const cps = checkpoints.clone();
  accrue(s, max(now, s.lastUpdate), cps);
  const h = { ...harbor };
  settle(s, h, cps);
  return h.owed;
}

// ---------------------------------------------------------------------------------- prices

export function effectiveDepth(base: bigint, level: number, bpsPerLevel: number): bigint {
  return (base * (BPS + BigInt(level) * BigInt(bpsPerLevel))) / BPS;
}

export function grow(base: bigint, growthBps: number, steps: number): bigint {
  let v = base;
  for (let i = 0; i < steps; i++) v = ceilDiv(v * BigInt(growthBps), BPS);
  return v;
}

export function reinforceCost(lamportsPerDepth: bigint, growthBps: number, baseDepth: bigint, nextLevel: number) {
  return grow(lamportsPerDepth * baseDepth, growthBps, Math.max(0, nextLevel - 1));
}

export function slotCost(baseLamports: bigint, growthBps: number, startSlots: number, slots: number) {
  return grow(baseLamports, growthBps, Math.max(0, slots - startSlots));
}

export function splitFee(fee: bigint, poolBps: number): { toPool: bigint; toTreasury: bigint } {
  const toPool = ceilDiv(fee * BigInt(poolBps), BPS);
  return { toPool, toTreasury: fee - toPool };
}

// ---------------------------------------------------------------------------------- estimates

/** Lamports per day the stream is paying out right now (0 when nobody is docked). */
export function currentPayoutPerDay(pool: RewardState, now: bigint): number {
  if (pool.totalDepth === 0n || pool.streamEnd <= now || pool.streamRemaining === 0n) return 0;
  return (Number(pool.streamRemaining) / Number(pool.streamEnd - now)) * 86_400;
}

/**
 * Lamports per depth unit per day used for payback estimates (DESIGN.md §11): the lower of the
 * current stream rate and the trailing-24h actual payout rate, so a stream still draining after
 * minting stopped does not make estimates look better than reality.
 */
export function estimateRatePerDepthDay(pool: RewardState, now: bigint, trailing24hPayout?: number): number {
  if (pool.totalDepth === 0n) return 0;
  const current = currentPayoutPerDay(pool, now);
  const rate = trailing24hPayout === undefined ? current : Math.min(current, trailing24hPayout);
  return rate / Number(pool.totalDepth);
}

export const NEVER_DAYS = 5 * 365;

/** Days for `depthGain` to earn back `cost` at `ratePerDepthDay`, or 'never' (zero rate / > 5 years). */
export function paybackDays(cost: bigint, depthGain: bigint, ratePerDepthDay: number): number | 'never' {
  if (ratePerDepthDay <= 0 || depthGain <= 0n) return 'never';
  const days = Number(cost) / (Number(depthGain) * ratePerDepthDay);
  return days > NEVER_DAYS ? 'never' : days;
}
