/**
 * Server-side chain access. Uses the keyed Helius RPC when HELIUS_API_KEY is set (never sent to the
 * browser), otherwise the public endpoint.
 */
import { AbyssClient, MPL_CORE_ID } from "@abyss-haul/client";
import { Connection, PublicKey } from "@solana/web3.js";
import { CLUSTER, PUBLIC_RPC_URL } from "@/lib/config";

export function serverRpcUrl(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return PUBLIC_RPC_URL;
  return `https://${CLUSTER === "mainnet" ? "mainnet" : "devnet"}.helius-rpc.com/?api-key=${key}`;
}

let cached: AbyssClient | undefined;
export function serverClient(): AbyssClient {
  cached ??= new AbyssClient(new Connection(serverRpcUrl(), "confirmed"), CLUSTER);
  return cached;
}

export const TIERS = ["Rust Bucket", "Reef Runner", "Kelp Cutter", "Trench Diver", "Leviathan", "The Abyssal One"];

export type SubStateName = "idle" | "docked" | "away" | "returning";

export interface FleetSub {
  asset: string;
  mintIndex: number;
  tier: number;
  tierName: string;
  level: number;
  depth: number;
  barnacles: number;
  state: SubStateName;
  owner: string | null;
  harbor: string | null;
  awayUntil: number;
}

export interface FleetHarbor {
  address: string;
  owner: string;
  slots: number;
  docked: number;
  depth: number;
  boostExtra: number;
  boostEndHour: number;
  totalClaimed: string;
}

const stateName = (s: object): SubStateName => Object.keys(s)[0] as SubStateName;

/** Core AssetV1: key(1) = 1 | owner(32) | ... */
function coreOwner(data: Buffer | undefined): string | null {
  if (!data || data.length < 33 || data[0] !== 1) return null;
  return new PublicKey(data.subarray(1, 33)).toBase58();
}

let snapshot: { at: number; subs: FleetSub[]; harbors: FleetHarbor[] } | undefined;

/**
 * Every sub and harbor, with owners. Built from our program's own accounts (small) plus one
 * batched read of the Core assets for owners, so it needs no Core-wide scan or DAS.
 * Cached per server instance for `maxAgeMs`.
 */
export async function fleetSnapshot(maxAgeMs = 15_000) {
  if (snapshot && Date.now() - snapshot.at < maxAgeMs) return snapshot;
  const client = serverClient();
  const [subs, harbors] = await Promise.all([client.program.account.sub.all(), client.program.account.harbor.all()]);

  const harborOwner = new Map(harbors.map((h) => [h.publicKey.toBase58(), h.account.owner.toBase58()]));
  const assets = subs.map((s) => s.account.asset);
  const owners = new Map<string, string | null>();
  for (let i = 0; i < assets.length; i += 100) {
    const batch = assets.slice(i, i + 100);
    const infos = await client.connection.getMultipleAccountsInfo(batch);
    batch.forEach((a, k) => owners.set(a.toBase58(), infos[k]?.owner.equals(MPL_CORE_ID) ? coreOwner(infos[k]!.data) : null));
  }

  const fleet: FleetSub[] = subs.map(({ account: s }) => {
    const state = stateName(s.state);
    const harbor = state === "idle" ? null : s.harbor.toBase58();
    return {
      asset: s.asset.toBase58(),
      mintIndex: s.mintIndex.toNumber(),
      tier: s.tier,
      tierName: TIERS[s.tier] ?? `Tier ${s.tier}`,
      level: s.level,
      depth: s.depth.toNumber(),
      barnacles: s.barnacles,
      state,
      owner: owners.get(s.asset.toBase58()) ?? (harbor ? harborOwner.get(harbor) ?? null : null),
      harbor,
      awayUntil: s.awayUntil.toNumber(),
    };
  });
  const harborList: FleetHarbor[] = harbors.map(({ publicKey, account: h }) => ({
    address: publicKey.toBase58(),
    owner: h.owner.toBase58(),
    slots: h.slots,
    docked: h.docked,
    depth: h.rewards.depth.toNumber(),
    boostExtra: h.rewards.boostExtra.toNumber(),
    boostEndHour: h.rewards.boostEndHour.toNumber(),
    totalClaimed: h.totalClaimed.toString(),
  }));
  snapshot = { at: Date.now(), subs: fleet.sort((a, b) => b.mintIndex - a.mintIndex), harbors: harborList };
  return snapshot;
}

/** True when the program has not been initialized on this cluster yet. */
export async function programReady(): Promise<boolean> {
  const client = serverClient();
  return (await client.connection.getAccountInfo(client.pda.config())) !== null;
}
