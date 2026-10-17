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
