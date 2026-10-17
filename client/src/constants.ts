import { PublicKey } from '@solana/web3.js';
import idl from './idl/abyss_haul.json';

export type Cluster = 'mainnet' | 'devnet' | 'localnet';

export const PROGRAM_ID = new PublicKey(idl.address);
export const MPL_CORE_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

/** Must match the program build: mainnet by default, `--features devnet` for devnet. */
export const SWITCHBOARD_PROGRAM: Record<Cluster, PublicKey> = {
  mainnet: new PublicKey('SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv'),
  devnet: new PublicKey('Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2'),
  localnet: new PublicKey('SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv'),
};

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
 * Compute units measured per instruction (programs/abyss-haul/tests/compute_units.rs). Transactions
 * request measured × 1.3 plus SWITCHBOARD_CU when they carry a Switchboard instruction.
 */
export const MEASURED_CU = {
  openHarbor: 12_640,
  mintCommit: 34_243,
  mintReveal: 58_738,
  dock: 36_889,
  undock: 36_554,
  fundPool: 18_662,
  claim: 22_652,
  settle: 15_074,
  crank: 11_559,
  reinforce: 32_865,
  expandHarbor: 26_870,
  merge: 128_926,
  expeditionStart: 21_987,
  expeditionReturnCommit: 6_961,
  expeditionReturnReveal: 24_063,
  admin: 15_000,
  initialize: 120_000,
} as const;
export const SWITCHBOARD_CU = 150_000;
