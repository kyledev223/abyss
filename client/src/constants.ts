import { PublicKey } from '@solana/web3.js';
import idl from './idl/abyss_haul.json';

export type Cluster = 'mainnet' | 'devnet' | 'localnet';

export const PROGRAM_ID = new PublicKey(idl.address);
export const MPL_CORE_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

export const SEEDS = {
  config: 'config',
  pool: 'pool',
  vault: 'vault',
  authority: 'authority',
  harbor: 'harbor',
  sub: 'sub',
  asset: 'asset',
  pending: 'pending',
  eventAuthority: '__event_authority',
} as const;

// Mirrors programs/abyss-haul/src/constants.rs.
export const REVEAL_TIMEOUT = 3_600;
export const EXPEDITION_COOLDOWN = 24 * 3_600;
export const MAX_EXPEDITION_HOURS = 6;
export const MINT_RENT_DEPOSIT = 10_000_000n;
export const HOUR = 3_600;

/**
 * Compute units measured per instruction (programs/abyss-haul/tests/compute_units.rs; commits
 * include the ORAO request CPI). Transactions request measured × 1.3.
 */
export const MEASURED_CU = {
  openHarbor: 14_147,
  mintCommit: 55_041,
  mintReveal: 58_770,
  dock: 36_290,
  undock: 36_559,
  fundPool: 18_671,
  claim: 22_652,
  settle: 15_074,
  crank: 11_559,
  reinforce: 32_889,
  expandHarbor: 26_870,
  merge: 129_005,
  expeditionStart: 22_001,
  expeditionReturnCommit: 28_057,
  expeditionReturnReveal: 24_041,
  admin: 15_000,
  initialize: 120_000,
} as const;
