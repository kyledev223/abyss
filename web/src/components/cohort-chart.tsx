"use client";

import { useMemo, useState } from "react";
import outcomes from "../../../sim/cohort-outcomes.json";

/**
 * Cohort outcomes from sim/economics.mjs (never hand-drawn). Each bar is one mint week: its height
 * is that cohort's return by day 120, its width is its share of all SOL paid in, so the area below
 * zero shows how much of the money lost. Gain/loss colours validated with the dataviz palette
 * checker against the chart surface; bar direction encodes polarity too.
 */
const GAIN = "#26a38a";
const LOSS = "#c4842c";

type ScenarioKey = keyof typeof outcomes.scenarios;
interface Cohort {
  week: number;
  shareOfMintsPct: number;
  paidIn: number;
  earned: number;
  roiPct: number;
}

const W = 760;
const H = 360;
const PAD = { l: 52, r: 16, t: 20, b: 44 };

export function CohortChart() {
  const order = outcomes.scenarioOrder as ScenarioKey[];
  const [key, setKey] = useState<ScenarioKey>(outcomes.defaultScenario as ScenarioKey);
  const [hover, setHover] = useState<number | null>(null);
  const s = outcomes.scenarios[key];
  const cohorts = s.cohorts as Cohort[];

  const geo = useMemo(() => {
    const total = cohorts.reduce((a, c) => a + c.paidIn, 0);
    const yMax = Math.max(50, Math.ceil(Math.max(...cohorts.map((c) => c.roiPct)) / 50) * 50);
    const yMin = -100;
    const y = (v: number) => PAD.t + ((yMax - v) / (yMax - yMin)) * (H - PAD.t - PAD.b);
    const plotW = W - PAD.l - PAD.r;
    const widths = cohorts.map((c) => (c.paidIn / total) * plotW);
    const bars = cohorts.map((c, i) => ({
      c,
      w: widths[i],
      x: PAD.l + widths.slice(0, i).reduce((a, b) => a + b, 0),
    }));
    const ticks = [];
    for (let v = yMin; v <= yMax; v += 50) ticks.push(v);
    return { bars, y, ticks };
  }, [cohorts]);

  const floor = outcomes.groupFloorPct;
  const active = hover === null ? null : geo.bars[hover];

  return (
    <figure>
      <div role="group" aria-label="Launch scenario" className="mb-4 flex flex-wrap gap-2">
        {order.map((k) => (
          <button
            key={k}
            onClick={() => setKey(k)}
            aria-pressed={key === k}
            className={`h-9 rounded-full border px-4 text-sm ${key === k ? "border-plankton text-plankton" : "border-kelp text-silt hover:text-foam"}`}
          >
            {outcomes.scenarios[k].label}
            {k === outcomes.defaultScenario && " (worst case)"}
          </button>
        ))}
      </div>
      <p className="mb-4 max-w-3xl text-[0.95rem] text-silt">{s.description}</p>

      <div className="relative rounded-[var(--radius-hull)] bg-trench p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby="cohort-title cohort-desc">
          <title id="cohort-title">{`Return by day 120 for each mint week: ${s.label}`}</title>
          <desc id="cohort-desc">{`${Math.round(s.capitalInLossPct)}% of all SOL paid in went to weeks that lost money. Players as a group: ${Math.round(s.groupRoiPct)}%.`}</desc>
          {geo.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)} stroke="#1d4a53" strokeWidth={v === 0 ? 1.5 : 1} />
              <text x={PAD.l - 8} y={geo.y(v) + 4} textAnchor="end" fontSize="12" fill="#8fb0b2">
                {v > 0 ? `+${v}%` : `${v}%`}
              </text>
            </g>
          ))}
          {geo.bars.map(({ c, x, w }, i) => {
            const y0 = geo.y(0);
            const y1 = geo.y(c.roiPct);
            const top = Math.min(y0, y1);
            const h = Math.max(1, Math.abs(y1 - y0));
            const gap = w > 4 ? 1 : 0; // 2px surface gap between neighbours
            return (
              <g key={c.week} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={x} y={PAD.t} width={w} height={H - PAD.t - PAD.b} fill="transparent" />
                <rect
                  x={x + gap}
                  y={top}
                  width={Math.max(0.5, w - gap * 2)}
                  height={h}
                  rx={Math.min(4, (w - gap * 2) / 2)}
                  fill={c.roiPct >= 0 ? GAIN : LOSS}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              </g>
            );
          })}
          {/* Group floor: the whole player base, every scenario. */}
          <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(floor)} y2={geo.y(floor)} stroke="#dcefef" strokeWidth="1.5" strokeDasharray="6 4" />
          {/* Label sits under the line on the left, where early weeks' gain bars leave the plot empty. */}
          <text x={PAD.l + 8} y={geo.y(floor) + 18} fontSize="12" fill="#dcefef">
            Players as a group: {floor}% or worse
          </text>
          <text x={PAD.l} y={H - 12} fontSize="12" fill="#8fb0b2">
            Earliest mint week
          </text>
          <text x={W - PAD.r} y={H - 12} textAnchor="end" fontSize="12" fill="#8fb0b2">
            Latest. Bar width = share of all SOL paid in
          </text>
        </svg>
        {active && (
          <div
            role="status"
            className="pointer-events-none absolute top-3 rounded-md border border-kelp bg-abyss px-3 py-2 text-sm shadow-lg"
            style={{ left: `clamp(8px, ${((active.x + active.w / 2) / W) * 100}% - 110px, calc(100% - 228px))`, width: 220 }}
          >
            <p className="font-bold">Week {active.c.week} buyers</p>
            <p className="text-silt">
              Paid in {active.c.paidIn.toFixed(1)} SOL ({active.c.shareOfMintsPct}% of all mints)
            </p>
            <p className="text-silt">Got back {active.c.earned.toFixed(1)} SOL by day 120</p>
            <p>{active.c.roiPct >= 0 ? `Gained ${active.c.roiPct.toFixed(0)}%` : `Lost ${Math.abs(active.c.roiPct).toFixed(0)}%`}</p>
          </div>
        )}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-silt">
        <span>
          <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: GAIN }} />
          Week gained money
        </span>
        <span>
          <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: LOSS }} />
          Week lost money
        </span>
        <span>
          {Math.round(s.capitalInLossPct)}% of all SOL paid in went to weeks that lost money; {Math.round(s.capitalLostOverHalfPct)}% to weeks that
          lost more than half.
        </span>
      </figcaption>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[0.95rem]">
          <caption className="mb-2 text-left text-silt">Every mint week in this scenario, as a table</caption>
          <thead className="text-sm text-silt">
            <tr className="border-b border-kelp">
              <th scope="col" className="py-2 font-normal">Mint week</th>
              <th scope="col" className="py-2 text-right font-normal">Share of mints</th>
              <th scope="col" className="py-2 text-right font-normal">Paid in</th>
              <th scope="col" className="py-2 text-right font-normal">Got back by day 120</th>
              <th scope="col" className="py-2 text-right font-normal">Return</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.week} className="border-b border-kelp/50">
                <td className="py-1.5">Week {c.week}</td>
                <td className="py-1.5 text-right">{c.shareOfMintsPct}%</td>
                <td className="py-1.5 text-right">{c.paidIn.toFixed(1)} SOL</td>
                <td className="py-1.5 text-right">{c.earned.toFixed(1)} SOL</td>
                <td className="py-1.5 text-right">{c.roiPct >= 0 ? `+${c.roiPct.toFixed(0)}%` : `${c.roiPct.toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className="pt-2">All players</td>
              <td className="pt-2 text-right">100%</td>
              <td className="pt-2 text-right">{s.totals.paidIn.toFixed(0)} SOL</td>
              <td className="pt-2 text-right">{(s.totals.paidOut + s.totals.stillStreaming).toFixed(0)} SOL</td>
              <td className="pt-2 text-right">{s.groupRoiPct.toFixed(0)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </figure>
  );
}
