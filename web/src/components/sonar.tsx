"use client";

import { useSyncExternalStore } from "react";
import type { FleetSub } from "@/lib/server/chain";

const SWEEP_SECONDS = 6;

/** Stable 0–1 from an address string. */
function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100_000) / 100_000;
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (on) => {
      const q = window.matchMedia(REDUCED);
      q.addEventListener("change", on);
      return () => q.removeEventListener("change", on);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/**
 * The hero: a sonar scope where every blip is a real docked sub. Deeper tiers sit on outer rings,
 * blip size follows Depth Rating, and each blip pings as the sweep passes over it. The sweep turns
 * clockwise from 3 o'clock, so a blip at angle a pings a/360 of the way through each turn.
 */
export function Sonar({ subs, loading }: { subs: FleetSub[]; loading: boolean }) {
  const reduced = useReducedMotion();
  const docked = subs.filter((s) => s.state === "docked").slice(0, 400);
  const R = 280;
  const dur = `${SWEEP_SECONDS}s`;
  return (
    <figure className="relative mx-auto w-full max-w-[540px]">
      <svg viewBox="-300 -300 600 600" className="aspect-square w-full" role="img" aria-label={`Sonar: ${docked.length} subs docked right now`}>
        <defs>
          <radialGradient id="scope" r="1">
            <stop offset="0" stopColor="#0e3742" />
            <stop offset="1" stopColor="#041a21" />
          </radialGradient>
          <linearGradient id="beam" x1="0" y1="1" x2="0.6" y2="0">
            <stop offset="0" stopColor="#7cf5da" stopOpacity=".4" />
            <stop offset="1" stopColor="#7cf5da" stopOpacity="0" />
          </linearGradient>
          <clipPath id="scope-clip">
            <circle r={R} />
          </clipPath>
        </defs>
        <circle r={R} fill="url(#scope)" />
        <g clipPath="url(#scope-clip)">
          {[0.25, 0.5, 0.75].map((k) => (
            <circle key={k} r={R * k} fill="none" stroke="#1d4a53" strokeWidth="1" strokeDasharray="2 6" />
          ))}
          <path d={`M-${R} 0H${R}M0 -${R}V${R}`} stroke="#1d4a53" strokeWidth="1" />

          {!reduced && (
            <g>
              {/* Trailing wedge behind the leading edge (which points east at t = 0). */}
              <path d={`M0 0 L${R} 0 A${R} ${R} 0 0 0 ${R * Math.cos(-0.7)} ${R * Math.sin(-0.7)} Z`} fill="url(#beam)" />
              <path d={`M0 0 L${R} 0`} stroke="#7cf5da" strokeWidth="1.5" opacity=".75" />
              <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur={dur} repeatCount="indefinite" />
            </g>
          )}

          {docked.map((s) => {
            const angle = hash01(s.asset) * 360;
            const radius = R * (0.14 + (s.tier / 5) * 0.68 + hash01(s.asset, 7) * 0.12);
            const x = radius * Math.cos((angle * Math.PI) / 180);
            const y = radius * Math.sin((angle * Math.PI) / 180);
            const size = 2.5 + Math.sqrt(s.depth) / 14;
            const begin = `${((angle / 360) * SWEEP_SECONDS).toFixed(2)}s`;
            return (
              <g key={s.asset}>
                <circle cx={x} cy={y} r={size} fill="#7cf5da" opacity=".5" />
                {!reduced && (
                  <circle cx={x} cy={y} r={size} fill="none" stroke="#7cf5da" strokeWidth="1.5" opacity="0">
                    <animate attributeName="r" values={`${size};${size * 3.2};${size * 3.2}`} keyTimes="0;0.35;1" dur={dur} begin={begin} repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0;0" keyTimes="0;0.35;1" dur={dur} begin={begin} repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
        </g>
        <circle r={R} fill="none" stroke="#1d4a53" strokeWidth="2" />
      </svg>
      <figcaption className="mt-3 text-center text-sm text-silt">
        {loading
          ? "Listening for subs…"
          : docked.length === 0
            ? "No subs docked yet. The first one to dock gets the whole stream."
            : `${docked.length.toLocaleString("en-US")} subs docked. Outer rings are deeper tiers; bigger blips dive deeper.`}
      </figcaption>
    </figure>
  );
}
