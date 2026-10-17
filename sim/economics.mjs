// Abyss Haul economics simulation. Pure Node, no deps.
// Models the on-chain rules from DESIGN.md: pro-rata depth, Synthetix rolling
// stream (all unreleased funds re-spread over the window on each deposit).
// Reads the locked defaults from defaults.json; writes cohort-outcomes.json for the Docs chart.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const D = JSON.parse(readFileSync(here('../config/defaults.json'), 'utf8'));
const SOL = 1e9;

const P = {
  mintPrice: D.mintPriceLamports / SOL,
  pool: D.poolBps / 10000,
  windowH: D.windowSeconds / 3600,
  tiers: D.tiers,
  reinforceBpsPerLevel: D.reinforce.bpsPerLevel,
  reinforceLevels: D.reinforce.maxLevel,
  reinforcePerDepth: D.reinforce.lamportsPerBaseDepth / SOL,
  reinforceGrowth: D.reinforce.growthBps / 10000,
  mergeFee: D.mergeFeeLamports.map(l => l / SOL),
};

const avgDepth = P.tiers.reduce((s, t) => s + t.depth * t.oddsBps / 10000, 0);
const f = (x, d = 4) => (x === Infinity ? '   never' : x.toFixed(d));
const pad = (s, n) => String(s).padStart(n);
const padE = (s, n) => String(s).padEnd(n);
const reinforceCost = (L, baseDepth) => P.reinforcePerDepth * baseDepth * P.reinforceGrowth ** (L - 1);

console.log(`Locked defaults: mint ${P.mintPrice} SOL, pool ${P.pool * 100}%, window ${P.windowH}h, E[depth per mint] = ${avgDepth.toFixed(1)}`);

// ---------------------------------------------------------------------------
console.log('\n=== 1. Per-sub earnings vs fleet size (fixed inflow: 50 mints/day, upgrades ignored) ===');
// Steady state: everything deposited is streamed out, so daily payout ~= daily pool inflow.
const mintsPerDay = 50;
const dailyOut = mintsPerDay * P.mintPrice * P.pool;
console.log(`Pool inflow/outflow ≈ ${dailyOut.toFixed(2)} SOL/day, split across the whole fleet\n`);
console.log(padE('Tier', 17) + [100, 1000, 10000].map(n => pad(`N=${n} SOL/day`, 17) + pad('payback d', 11)).join(''));
for (const t of P.tiers) {
  let row = padE(t.name, 17);
  for (const n of [100, 1000, 10000]) {
    const perDay = dailyOut * t.depth / (n * avgDepth);
    row += pad(f(perDay, 5), 17) + pad(f(P.mintPrice / perDay, 0), 11);
  }
  console.log(row);
}
console.log('(payback = days for that tier to earn back one mint price at a constant fleet size; the fleet\n is not constant in practice, so real payback is longer)');

console.log('\n--- Same thing expressed as fleet growth rate (this is the number that actually matters) ---');
console.log('Average sub earns pool × price × g per day, where g = new mints / fleet / day. Fleet size cancels out.');
for (const g of [0.01, 0.03, 0.05, 0.10]) {
  const perAvgSub = P.pool * P.mintPrice * g;
  console.log(`  growth ${pad((g * 100).toFixed(0), 3)}%/day → avg sub ${f(perAvgSub, 5)} SOL/day, mint payback ${f(P.mintPrice / perAvgSub, 0)} days (if growth held that whole time)`);
}

// ---------------------------------------------------------------------------
console.log('\n=== 2. Pool drain over time (Synthetix rolling reset) ===');
// Scenario: 10 mints/hour for 24h, then minting stops. Hourly steps, exact linear stream.
function streamSim(depositsPerHour, hours) {
  let remaining = 0, end = 0;
  const out = [];
  for (let h = 0; h <= hours; h++) {
    if (h > 0) {
      const t0 = h - 1, t1 = Math.min(h, end);
      let rel = 0;
      if (t1 > t0 && remaining > 0) rel = t1 >= end ? remaining : remaining * (t1 - t0) / (end - t0);
      remaining -= rel;
      out.push({ h, released: rel, remaining });
    }
    const dep = depositsPerHour(h);
    if (dep > 0) { remaining += dep; end = h + P.windowH; }
  }
  return out;
}
const perHourDeposit = 10 * P.mintPrice * P.pool;
const series = streamSim(h => (h < 24 ? perHourDeposit : 0), 40);
const maxRel = Math.max(...series.map(s => s.released));
console.log(`10 mints/hour (${perHourDeposit.toFixed(2)} SOL/h into pool) for 24h, then minting stops at h=24:\n`);
console.log(' hour  in-stream SOL  paid this hour');
for (const s of series) if (s.h % 2 === 0 || s.h === 25)
  console.log(`${pad(s.h, 5)}  ${pad(s.remaining.toFixed(3), 13)}  ${pad(s.released.toFixed(3), 8)}  ${'█'.repeat(Math.round(30 * s.released / maxRel))}`);
console.log('The payout rate climbs toward the inflow rate (~1 window to settle), then after the last fee it');
console.log('holds flat and drops to zero exactly 12h later. No new fees → no earnings.');

// ---------------------------------------------------------------------------
console.log('\n=== 3. Merge and reinforce payback ===');
// Earnings per depth unit per day at a reference fleet: e = dailyOut / (N * avgDepth)
for (const n of [100, 1000, 10000]) {
  const e = dailyOut / (n * avgDepth);
  console.log(`\nReference: N=${n}, 50 mints/day → ${e.toExponential(3)} SOL per depth-unit per day`);
  console.log('  Merge (2 → 1)             depth gain  fee     payback d');
  for (let i = 0; i < P.tiers.length - 1; i++) {
    const gain = P.tiers[i + 1].depth - 2 * P.tiers[i].depth;
    console.log(`  ${padE(P.tiers[i].name + ' → ' + P.tiers[i + 1].name, 26)}${pad('+' + gain, 10)}  ${pad(P.mergeFee[i].toFixed(2), 5)}  ${pad(f(P.mergeFee[i] / (gain * e), 0), 9)}`);
  }
  // Cost scales with base depth, so payback is identical for every tier.
  console.log('  Reinforce (same payback for every tier):');
  console.log('    Lvl  cost/base-depth  Rust Bucket cost  Abyssal One cost  payback d');
  for (let L = 1; L <= P.reinforceLevels; L++) {
    const c = reinforceCost(L, 1);
    console.log(`    ${pad(L, 3)}  ${pad(c.toFixed(6), 15)}  ${pad(reinforceCost(L, P.tiers[0].depth).toFixed(4), 16)}  ${pad(reinforceCost(L, P.tiers[5].depth).toFixed(3), 16)}  ${pad(f(c / (P.reinforceBpsPerLevel / 10000 * e), 0), 9)}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Cohort outcomes. Each scenario is a mints-per-day curve over 120 days. Players dock and hold,
// no upgrades. ROI% is scale-invariant (halving every day's mints changes nothing), so scenarios
// differ by SHAPE, not volume.
const DAYS = 120;
const ramp = (peak, rampDays, holdDays, decay) => d =>
  d < rampDays ? (peak / rampDays) * d : d < rampDays + holdDays ? peak : peak * Math.exp(-decay * (d - rampDays - holdDays));

// "Most buyers near the top": take the base curve and scale the peak week until it holds `share` of all mints.
function topHeavy(baseCurve, peakWeek, share) {
  let inPeak = 0, rest = 0;
  for (let d = 0; d < DAYS; d++) (Math.floor(d / 7) === peakWeek ? (inPeak += baseCurve(d)) : (rest += baseCurve(d)));
  const k = (share * rest) / ((1 - share) * inPeak);
  return d => baseCurve(d) * (Math.floor(d / 7) === peakWeek ? k : 1);
}

const baseCurve = ramp(200, 20, 20, 0.06);
const SCENARIOS = {
  base:        { label: 'Base launch',          description: 'Ramp to 200 mints/day over 20 days, hold 20 days, then decline 6%/day.', curve: baseCurve },
  weak:        { label: 'Half volume',          description: 'Same shape as base at half the volume. Identical percentages: volume alone does not change cohort returns.', curve: ramp(100, 20, 20, 0.06) },
  fastDecline: { label: 'Fast decline',         description: 'Ramp over 20 days, only a 5-day peak, then decline 12%/day.', curve: ramp(200, 20, 5, 0.12) },
  topHeavy:    { label: 'Most buyers near the top', description: 'Base shape, but 60% of all mints land in the peak week (week 3).', curve: topHeavy(baseCurve, 3, 0.6) },
};

function cohortSim(mintCurve) {
  const cohorts = [];
  let fleetDepth = 0, paid = 0, treasury = 0, totalIn = 0, remaining = 0, end = 0, totalMints = 0;
  for (let hour = 0; hour < DAYS * 24; hour++) {
    const d = Math.floor(hour / 24), wk = Math.floor(d / 7);
    const t1 = Math.min(hour + 1, end);
    if (t1 > hour && remaining > 0 && fleetDepth > 0) {
      const rel = t1 >= end ? remaining : remaining * (t1 - hour) / (end - hour);
      remaining -= rel; paid += rel;
      for (const c of cohorts) if (c) c.earned += rel * c.depth / fleetDepth;
    } else if (fleetDepth === 0 && end > hour) end += 1; // stream pauses when nobody is docked
    const m = mintCurve(d) / 24;
    if (m > 0) {
      cohorts[wk] ??= { week: wk, mints: 0, cost: 0, depth: 0, earned: 0 };
      cohorts[wk].mints += m; totalMints += m;
      cohorts[wk].cost += m * P.mintPrice; cohorts[wk].depth += m * avgDepth; fleetDepth += m * avgDepth;
      totalIn += m * P.mintPrice; treasury += m * P.mintPrice * (1 - P.pool);
      remaining += m * P.mintPrice * P.pool; end = hour + 1 + P.windowH;
    }
  }
  const rows = cohorts.filter(c => c && c.cost > 0.01).map(c => ({
    week: c.week,
    shareOfMintsPct: +(100 * c.mints / totalMints).toFixed(1),
    paidIn: +c.cost.toFixed(2), earned: +c.earned.toFixed(2),
    roiPct: +((c.earned / c.cost - 1) * 100).toFixed(1),
  }));
  // Severity metric used to pick the Docs default: share of all SOL paid in by cohorts that lost more than half.
  const lostHalfPct = 100 * rows.filter(r => r.roiPct < -50).reduce((s, r) => s + r.paidIn, 0) / totalIn;
  const inLossPct = 100 * rows.filter(r => r.roiPct < 0).reduce((s, r) => s + r.paidIn, 0) / totalIn;
  return {
    days: DAYS, cohorts: rows,
    totals: { paidIn: +totalIn.toFixed(2), paidOut: +paid.toFixed(2), stillStreaming: +remaining.toFixed(2), treasury: +treasury.toFixed(2) },
    groupRoiPct: +(((paid + remaining) / totalIn - 1) * 100).toFixed(1),
    capitalInLossPct: +inLossPct.toFixed(1),
    capitalLostOverHalfPct: +lostHalfPct.toFixed(1),
  };
}

const results = {};
for (const [key, s] of Object.entries(SCENARIOS)) results[key] = { label: s.label, description: s.description, ...cohortSim(s.curve) };
const worst = Object.keys(results).reduce((a, b) => (results[b].capitalLostOverHalfPct > results[a].capitalLostOverHalfPct ? b : a));

console.log('\n=== 4. Cohort outcomes by day 120 (net return per mint week) ===');
const keys = Object.keys(results);
console.log('week' + keys.map(k => pad(k, 14)).join('') + '      (share of all mints in topHeavy)');
const maxWeek = Math.max(...keys.flatMap(k => results[k].cohorts.map(c => c.week)));
for (let w = 0; w <= maxWeek; w++) {
  const cells = keys.map(k => { const c = results[k].cohorts.find(x => x.week === w); return pad(c ? `${c.roiPct.toFixed(0)}%` : '–', 14); });
  const th = results.topHeavy.cohorts.find(x => x.week === w);
  console.log(pad(w, 4) + cells.join('') + pad(th ? `${th.shareOfMintsPct}%` : '', 12));
}
console.log('\n' + padE('', 26) + keys.map(k => pad(k, 14)).join(''));
console.log(padE('Group return', 26) + keys.map(k => pad(results[k].groupRoiPct.toFixed(0) + '%', 14)).join(''));
console.log(padE('SOL paid in by losers', 26) + keys.map(k => pad(results[k].capitalInLossPct.toFixed(0) + '%', 14)).join(''));
console.log(padE('SOL paid in, lost >50%', 26) + keys.map(k => pad(results[k].capitalLostOverHalfPct.toFixed(0) + '%', 14)).join(''));
console.log(`\nWorst case (most SOL in cohorts that lost >50%): ${worst} → Docs default.`);
console.log(`Players as a group: never better than -${100 - P.pool * 100}% (the treasury share), in every scenario.`);

writeFileSync(here('./cohort-outcomes.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  generator: 'sim/economics.mjs',
  defaults: D,
  groupFloorPct: -(100 - P.pool * 100),
  defaultScenario: worst,
  scenarioOrder: [worst, ...keys.filter(k => k !== worst)],
  scenarios: results,
}, null, 2));
console.log(`\nWrote ${here('./cohort-outcomes.json')}`);
