import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, SEEDS } from './constants';

const enc = (s: string) => Buffer.from(s);
const u64 = (n: bigint | number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

export class Pdas {
  constructor(readonly programId: PublicKey = PROGRAM_ID) {}

  private find(...seeds: Buffer[]) {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0];
  }

  config = () => this.find(enc(SEEDS.config));
  pool = () => this.find(enc(SEEDS.pool));
  vault = () => this.find(enc(SEEDS.vault));
  authority = () => this.find(enc(SEEDS.authority));
  eventAuthority = () => this.find(enc(SEEDS.eventAuthority));
  harbor = (owner: PublicKey) => this.find(enc(SEEDS.harbor), owner.toBuffer());
  sub = (asset: PublicKey) => this.find(enc(SEEDS.sub), asset.toBuffer());
  asset = (index: bigint | number) => this.find(enc(SEEDS.asset), u64(index));
  pending = (index: bigint | number) => this.find(enc(SEEDS.pending), u64(index));
  programData = () =>
    PublicKey.findProgramAddressSync(
      [this.programId.toBuffer()],
      new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
    )[0];
}
