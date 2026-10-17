"use client";

import { useState } from "react";
import { SOCIAL } from "@/lib/config";
import { short } from "@/lib/format";

const pumpUrl = (ca: string) => `https://pump.fun/coin/${ca}`;

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="currentColor">
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1 2h6.4l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
    </svg>
  );
}

const pill =
  "inline-flex h-10 items-center gap-2 rounded-[var(--radius-hull)] border border-kelp px-3 text-[0.95rem] font-bold text-foam no-underline hover:border-silt";

/** Header: compact X and pump.fun buttons (hidden until configured; footer-only on phones). */
export function SocialButtons() {
  if (!SOCIAL.twitter && !SOCIAL.pumpfunCa) return null;
  return (
    <div className="hidden items-center gap-2 sm:flex">
      {SOCIAL.twitter && (
        <a href={SOCIAL.twitter} target="_blank" rel="noreferrer" className={pill} aria-label="Abyss Haul on X">
          <XIcon />
        </a>
      )}
      {SOCIAL.pumpfunCa && (
        <a href={pumpUrl(SOCIAL.pumpfunCa)} target="_blank" rel="noreferrer" className={pill}>
          pump.fun
        </a>
      )}
    </div>
  );
}

/** Footer: the same links, plus the contract address with a copy button. */
export function SocialFooter() {
  const [copied, setCopied] = useState(false);
  if (!SOCIAL.twitter && !SOCIAL.pumpfunCa) return null;
  const ca = SOCIAL.pumpfunCa;
  return (
    <div className="mt-6 space-y-3 text-[0.95rem] text-silt">
      {SOCIAL.twitter && (
        <a href={SOCIAL.twitter} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-foam">
          <XIcon /> Follow on X
        </a>
      )}
      {ca && (
        <div>
          <a href={pumpUrl(ca)} target="_blank" rel="noreferrer" className="hover:text-foam">
            Token on pump.fun
          </a>
          <div className="mt-1 flex items-center gap-2">
            <code className="text-sm text-foam" title={ca}>
              {short(ca, 6)}
            </code>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(ca);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
              className="rounded border border-kelp px-2 py-0.5 text-xs text-foam hover:border-silt"
            >
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
          <p className="mt-1 text-xs">The token is separate from the game. It doesn&apos;t earn from the pool.</p>
        </div>
      )}
    </div>
  );
}
