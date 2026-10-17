import type { Cluster } from "@abyss-haul/client";

/** Public settings (safe in the browser). */
export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER ?? "devnet") as Exclude<Cluster, "localnet">;

/**
 * Browser RPC. Must not contain a secret key: use a public endpoint or a domain-restricted one.
 * Keyed Helius calls go through /api routes (see lib/server/chain.ts).
 */
export const PUBLIC_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? (CLUSTER === "mainnet" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;
export const explorerAddress = (addr: string) =>
  `https://explorer.solana.com/address/${addr}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;

/** Devnet is play money; say so everywhere it matters. */
export const IS_PLAY_MONEY = CLUSTER === "devnet";

/**
 * Social links, set in Vercel (inlined at build time, so redeploy after changing them). Each button
 * stays hidden until its value is set and valid.
 * - NEXT_PUBLIC_TWITTER: a handle ("abysshaul" or "@abysshaul") or an x.com / twitter.com URL
 * - NEXT_PUBLIC_PUMPFUN_CA: the token's contract (mint) address on pump.fun
 */
function twitterUrl(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  const handle = v.match(/^@?([A-Za-z0-9_]{1,15})$/)?.[1] ?? v.match(/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  return handle ? `https://x.com/${handle}` : undefined;
}

function pumpfunCa(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  return v && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v) ? v : undefined;
}

export const SOCIAL = {
  twitter: twitterUrl(process.env.NEXT_PUBLIC_TWITTER),
  pumpfunCa: pumpfunCa(process.env.NEXT_PUBLIC_PUMPFUN_CA),
};
