"use client";

import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import { renderSub } from "@/lib/art";

/** Draws a sub in the page (no network). `asset` seeds its look; omit for a tier sample. */
export function SubArt({
  asset,
  tier,
  level = 0,
  barnacles = 0,
  size = 160,
  label,
}: {
  asset?: string;
  tier: number;
  level?: number;
  barnacles?: number;
  size?: number;
  label: string;
}) {
  const svg = useMemo(() => {
    const seed = asset ? new PublicKey(asset).toBytes() : Uint8Array.from([tier * 41 + 3, tier * 7 + 11, 97, tier * 13 + 5]);
    return renderSub({ seed, tier, level, barnacles });
  }, [asset, tier, level, barnacles]);
  return (
    <div
      role="img"
      aria-label={label}
      className="overflow-hidden rounded-[var(--radius-hull)]"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", `<svg style="width:100%;height:100%" `) }}
    />
  );
}
