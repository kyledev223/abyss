/**
 * Client builders against the real program + Metaplex Core in LiteSVM (Node). Switchboard
 * randomness accounts are written directly (the program only reads them). The key check: the
 * TypeScript reward preview (src/math.ts) equals what an on-chain claim actually pays.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { address, getTransactionDecoder, lamports, type Address } from '@solana/kit';
import { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { FailedTransactionMetadata, LiteSVM } from 'litesvm';
import {
  AbyssClient,
  CHECKPOINTS_SPACE,
  Checkpoints,
  MPL_CORE_ID,
  PROGRAM_ID,
  SWITCHBOARD_PROGRAM,
  claimableAt,
  compileTx,
  launchParams,
  reinforceCost,
  toHarborRewards,
  toRewardState,
} from '../src';

const SOL = 1_000_000_000n;
const HOUR = 3_600n;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const addr = (k: PublicKey): Address => address(k.toBase58());
const RANDOMNESS_DISC = [10, 66, 229, 135, 220, 239, 217, 114];

class Sim {
  svm = new LiteSVM();
  client = new AbyssClient(new Connection('http://127.0.0.1:1'), 'localnet');
  deployer = Keypair.generate();
  treasury = Keypair.generate().publicKey;

  constructor() {
    this.svm.addProgramFromFile(addr(PROGRAM_ID), here('../../target/deploy/abyss_haul.so'));
    this.svm.addProgramFromFile(addr(MPL_CORE_ID), here('../../programs/abyss-haul/tests/fixtures/mpl_core.so'));
    const clock = this.svm.getClock();
    clock.unixTimestamp = 1_760_000_000n;
    this.svm.setClock(clock);
    this.svm.warpToSlot(1_000n);
    for (const k of [this.deployer.publicKey, this.treasury]) this.airdrop(k, 1_000n);
    // ProgramData: tag u32 | slot u64 | Option<Pubkey> upgrade authority → set the deployer.
    const pd = this.client.pda.programData();
    const acc = this.raw(pd)!;
    const data = new Uint8Array(acc.data);
    data[12] = 1;
    data.set(this.deployer.publicKey.toBytes(), 13);
    this.svm.setAccount({ ...acc, data });
  }

  raw(k: PublicKey) {
    const a = this.svm.getAccount(addr(k));
    return a.exists ? a : undefined;
  }
  lamportsOf = (k: PublicKey) => BigInt(this.raw(k)?.lamports ?? 0n);
  decode<T>(name: string, k: PublicKey): T {
    return this.client.program.coder.accounts.decode(name, Buffer.from(this.raw(k)!.data)) as T;
  }
  airdrop(k: PublicKey, sol: bigint) {
    this.svm.airdrop(addr(k), lamports(sol * SOL));
  }
  player(sol = 100n) {
    const k = Keypair.generate();
    this.airdrop(k.publicKey, sol);
    return k;
  }

  now = () => this.svm.getClock().unixTimestamp;
  slot = () => this.svm.getClock().slot;
  warp(secs: bigint) {
    const ts = this.now() + secs;
    this.svm.warpToSlot(this.slot() + (secs * 5n) / 2n + 1n);
    const clock = this.svm.getClock();
    clock.unixTimestamp = ts;
    this.svm.setClock(clock);
  }

  send(ixs: TransactionInstruction[], payer: Keypair, extra: Keypair[] = [], cu = 400_000) {
    const tx = compileTx(payer.publicKey, ixs, cu, 0, this.svm.latestBlockhash());
    tx.sign([payer, ...extra]);
    const res = this.svm.sendTransaction(getTransactionDecoder().decode(tx.serialize()));
    this.svm.expireBlockhash();
    if (res instanceof FailedTransactionMetadata) throw new Error(res.meta().logs().join('\n'));
  }

  writeRandomness(k: PublicKey, seedSlot: bigint, revealSlot: bigint, roll: bigint) {
    const data = new Uint8Array(8 + 32 * 3 + 8 + 32 + 8 + 32 + 96 + 128);
    const view = new DataView(data.buffer);
    data.set(RANDOMNESS_DISC, 0);
    view.setBigUint64(8 + 96, seedSlot, true);
    view.setBigUint64(8 + 136, revealSlot, true);
    view.setBigUint64(8 + 144, roll, true);
    this.svm.setAccount({
      address: addr(k),
      data,
      executable: false,
      lamports: lamports(this.svm.minimumBalanceForRentExemption(BigInt(data.length))),
      programAddress: addr(SWITCHBOARD_PROGRAM.localnet),
      space: BigInt(data.length),
    });
  }
  freshRandomness() {
    const k = Keypair.generate().publicKey;
    this.writeRandomness(k, this.slot() - 1n, 0n, 0n);
    return k;
  }
  reveal(k: PublicKey, roll: bigint) {
    this.warp(1n);
    const seed = new DataView(this.raw(k)!.data.buffer).getBigUint64(8 + 96, true);
    this.writeRandomness(k, seed, this.slot(), roll);
  }

  async initialize() {
    const checkpoints = Keypair.generate();
    const collection = Keypair.generate();
    const ixs = await this.client.initializeIxs({
      deployer: this.deployer.publicKey,
      admin: this.deployer.publicKey,
      treasury: this.treasury,
      params: launchParams(),
      uriBase: 'https://abysshaul.example/api/meta/',
      collectionUri: 'https://abysshaul.example/api/collection',
      checkpoints,
      collection,
      checkpointsRent: Number(this.svm.minimumBalanceForRentExemption(BigInt(CHECKPOINTS_SPACE))),
    });
    this.send(ixs, this.deployer, [checkpoints, collection]);
    this.client.addresses = { treasury: this.treasury, collection: collection.publicKey, checkpoints: checkpoints.publicKey };
  }

  async mint(p: Keypair, roll: bigint): Promise<PublicKey> {
    const index = BigInt(this.decode<{ mintedCount: { toString(): string } }>('pool', this.client.pda.pool()).mintedCount.toString());
    const r = this.freshRandomness();
    this.send([await this.client.mintCommitIx(p.publicKey, r, index)], p);
    this.reveal(r, roll);
    this.send([await this.client.mintRevealIx(p.publicKey, index, p.publicKey, r)], p);
    return this.client.pda.asset(index);
  }

  /** TypeScript preview of what `owner` can claim now. */
  preview(owner: PublicKey): bigint {
    const pool = this.decode<{ rewards: never }>('pool', this.client.pda.pool());
    const harbor = this.decode<{ rewards: never }>('harbor', this.client.pda.harbor(owner));
    const cps = new Checkpoints(this.raw(this.client.addresses!.checkpoints)!.data);
    return claimableAt(toRewardState(pool.rewards), toHarborRewards(harbor.rewards), this.now(), cps);
  }

  async claim(p: Keypair): Promise<bigint> {
    const total = () => BigInt(this.decode<{ totalClaimed: { toString(): string } }>('harbor', this.client.pda.harbor(p.publicKey)).totalClaimed.toString());
    const before = total();
    this.send([await this.client.claimIx(p.publicKey)], p);
    return total() - before;
  }
}

test('mint, dock, fund, claim: the TS preview matches the on-chain claim exactly', async () => {
  const s = new Sim();
  await s.initialize();
  const alice = s.player();
  const bob = s.player();
  for (const p of [alice, bob]) s.send([await s.client.openHarborIx(p.publicKey)], p);

  const a1 = await s.mint(alice, 0n); // Rust Bucket
  const a2 = await s.mint(alice, 9_990n); // The Abyssal One
  const b1 = await s.mint(bob, 6_000n); // Reef Runner
  for (const [p, a] of [[alice, a1], [alice, a2], [bob, b1]] as const) s.send([await s.client.dockIx(p.publicKey, a)], p);

  s.send([await s.client.fundPoolIx(s.deployer.publicKey, 37n * SOL + 123_457n)], s.deployer);
  for (const step of [17n, HOUR, 5n * HOUR + 11n, 13n * HOUR]) {
    s.warp(step);
    for (const p of [alice, bob]) {
      const want = s.preview(p.publicKey);
      assert.equal(await s.claim(p), want, `claim after +${step}s`);
    }
  }
});

test('preview stays exact across an expedition boost and its hour-boundary expiry', async () => {
  const s = new Sim();
  await s.initialize();
  const alice = s.player();
  const bob = s.player();
  for (const p of [alice, bob]) s.send([await s.client.openHarborIx(p.publicKey)], p);
  const a = await s.mint(alice, 0n);
  const b = await s.mint(bob, 0n);
  s.send([await s.client.dockIx(alice.publicKey, a)], alice);
  s.send([await s.client.dockIx(bob.publicKey, b)], bob);
  s.send([await s.client.fundPoolIx(s.deployer.publicKey, 100n * SOL)], s.deployer);

  s.send([await s.client.expeditionStartIx(alice.publicKey, a, 2)], alice);
  s.warp(2n * HOUR);
  const r = s.freshRandomness();
  s.send([await s.client.expeditionReturnCommitIx(alice.publicKey, a, r)], alice);
  s.reveal(r, 100n); // boost: +100% for 4 h, snapped up to the hour
  s.send([await s.client.expeditionReturnRevealIx(bob.publicKey, a, alice.publicKey, r)], bob);
  const harbor = s.decode<{ rewards: { boostExtra: { toNumber(): number } } }>('harbor', s.client.pda.harbor(alice.publicKey));
  assert.equal(harbor.rewards.boostExtra.toNumber(), 100);

  // Bob claims mid-boost; Alice stays untouched until well after the boost ended.
  // (Each preview is taken before its claim: the claim changes what is left to preview.)
  s.warp(HOUR);
  let want = s.preview(bob.publicKey);
  assert.equal(await s.claim(bob), want, 'bob mid-boost');
  s.warp(6n * HOUR);
  want = s.preview(alice.publicKey);
  assert.ok(want > 0n);
  assert.equal(await s.claim(alice), want, 'boost window credited from the checkpoint');
  want = s.preview(bob.publicKey);
  assert.equal(await s.claim(bob), want, 'bob after the boost');
});

test('reinforce and merge builders; TS prices match what the program charges', async () => {
  const s = new Sim();
  await s.initialize();
  const alice = s.player();
  s.send([await s.client.openHarborIx(alice.publicKey)], alice);
  const a = await s.mint(alice, 0n);
  const b = await s.mint(alice, 0n);
  s.send([await s.client.dockIx(alice.publicKey, a)], alice);

  const p = launchParams();
  const vault = s.client.pda.vault();
  const before = s.lamportsOf(vault) + s.lamportsOf(s.treasury);
  s.send([await s.client.reinforceIx(alice.publicKey, a)], alice);
  const charged = s.lamportsOf(vault) + s.lamportsOf(s.treasury) - before;
  assert.equal(charged, reinforceCost(BigInt(p.reinforceLamportsPerDepth.toString()), p.reinforceGrowthBps, 100n, 1));

  const next = BigInt(s.decode<{ mintedCount: { toString(): string } }>('pool', s.client.pda.pool()).mintedCount.toString());
  s.send([await s.client.mergeIx(alice.publicKey, a, b, next)], alice);
  const merged = s.decode<{ tier: number; depth: { toNumber(): number } }>('sub', s.client.pda.sub(s.client.pda.asset(next)));
  assert.equal(merged.tier, 1);
  assert.equal(merged.depth.toNumber(), 220);
  s.send([await s.client.expandHarborIx(alice.publicKey)], alice);
  s.send([await s.client.undockIx(alice.publicKey, s.client.pda.asset(next))], alice);
});
