/**
 * ORAO VRF, as the program uses it (DESIGN.md §7). Mirrors programs/abyss-haul/src/external/orao.rs.
 *
 *   1. commit:  our *_commit instruction CPIs ORAO `request_v2(seed)`; seed mixes in a random nonce
 *   2. ORAO's authorities fulfil the request account within seconds (no client call needed)
 *   3. reveal:  our *_reveal instruction reads the fulfilled value
 */
import { sha256 } from '@noble/hashes/sha2';
import { PublicKey, type Connection } from '@solana/web3.js';

export const ORAO_VRF_ID = new PublicKey('VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y');
const NETWORK_STATE_SEED = Buffer.from('orao-vrf-network-configuration');
const REQUEST_SEED = Buffer.from('orao-vrf-randomness-request');
const RANDOMNESS_V2_DISCRIMINATOR = Buffer.from([139, 239, 184, 215, 227, 86, 191, 226]);

const u64le = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const i64le = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
};

export const oraoNetworkState = () => PublicKey.findProgramAddressSync([NETWORK_STATE_SEED], ORAO_VRF_ID)[0];
export const oraoRequest = (seed: Uint8Array) => PublicKey.findProgramAddressSync([REQUEST_SEED, seed], ORAO_VRF_ID)[0];

/** sha256("abyss-haul:mint" ‖ mint_index LE ‖ payer ‖ nonce) */
export const mintSeed = (mintIndex: bigint, payer: PublicKey, nonce: Uint8Array) =>
  Buffer.from(sha256(Buffer.concat([Buffer.from('abyss-haul:mint'), u64le(mintIndex), payer.toBuffer(), nonce])));

/** sha256("abyss-haul:expedition" ‖ sub ‖ away_until LE ‖ nonce) */
export const expeditionSeed = (sub: PublicKey, awayUntil: bigint, nonce: Uint8Array) =>
  Buffer.from(sha256(Buffer.concat([Buffer.from('abyss-haul:expedition'), sub.toBuffer(), i64le(awayUntil), nonce])));

/** 32 unpredictable bytes; keeps anyone from pre-creating the request account for your commit. */
export function randomNonce(): number[] {
  return [...globalThis.crypto.getRandomValues(new Uint8Array(32))];
}

/** ORAO network state: disc(8) | authority(32) | treasury(32) | request_fee(u64) | ... */
export function parseNetworkState(data: Uint8Array) {
  const buf = Buffer.from(data);
  return { treasury: new PublicKey(buf.subarray(40, 72)), requestFee: buf.readBigUInt64LE(72) };
}

export async function fetchOraoNetwork(connection: Connection) {
  const acc = await connection.getAccountInfo(oraoNetworkState());
  if (!acc) throw new Error('ORAO network state not found on this cluster');
  return parseNetworkState(acc.data);
}

/** RandomnessV2: disc(8) | tag(1: 0 pending, 1 fulfilled) | client(32) | seed(32) | randomness(64) */
export function parseRequest(data: Uint8Array) {
  const buf = Buffer.from(data);
  if (buf.length < 73 || !buf.subarray(0, 8).equals(RANDOMNESS_V2_DISCRIMINATOR)) return undefined;
  const fulfilled = buf[8] === 1 && buf.length >= 137;
  return {
    fulfilled,
    seed: buf.subarray(41, 73),
    randomness: fulfilled ? buf.subarray(73, 137) : undefined,
  };
}

/** Polls until ORAO has fulfilled `request` (usually a few seconds). */
export async function waitForFulfillment(
  connection: Connection,
  request: PublicKey,
  { timeoutMs = 90_000, pollMs = 1_000 } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const acc = await connection.getAccountInfo(request, 'confirmed');
    if (acc && parseRequest(acc.data)?.fulfilled) return true;
    await new Promise((ok) => setTimeout(ok, pollMs));
  }
  return false;
}
