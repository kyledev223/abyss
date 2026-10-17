import { BN, Program, type Provider } from '@anchor-lang/core';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import { MEASURED_CU, MPL_CORE_ID, PROGRAM_ID, type Cluster } from './constants';
import { compileTx, estimatePriorityFee, writableKeys, type FeeOptions } from './fees';
import idl from './idl/abyss_haul.json';
import type { AbyssHaul } from './idl/abyss_haul';
import { Checkpoints, toHarborRewards, toRewardState, claimableAt } from './math';
import type { Params } from './params';
import { Pdas } from './pdas';

/** Size of the `Checkpoints` zero-copy account: discriminator + 720 × 24 bytes. */
export const CHECKPOINTS_SPACE = 8 + 720 * 24;

export interface ProgramAddresses {
  treasury: PublicKey;
  collection: PublicKey;
  checkpoints: PublicKey;
}

/**
 * Instruction builders and account readers for the Abyss Haul program. Builders are offline (no
 * RPC) once `addresses` is known; call `load()` to read them from `Config`.
 */
export class AbyssClient {
  readonly program: Program<AbyssHaul>;
  readonly pda: Pdas;
  addresses?: ProgramAddresses;

  constructor(
    readonly connection: Connection,
    readonly cluster: Cluster,
    programId: PublicKey = PROGRAM_ID,
  ) {
    const withAddress = { ...(idl as AbyssHaul), address: programId.toBase58() } as AbyssHaul;
    this.program = new Program<AbyssHaul>(withAddress, { connection } as Provider);
    this.pda = new Pdas(programId);
  }

  async load(): Promise<ProgramAddresses> {
    const c = await this.config();
    this.addresses = { treasury: c.treasury, collection: c.collection, checkpoints: c.checkpoints };
    return this.addresses;
  }

  private get a(): ProgramAddresses {
    if (!this.addresses) throw new Error('AbyssClient: call load() (or set addresses) first');
    return this.addresses;
  }

  private common() {
    return {
      config: this.pda.config(),
      pool: this.pda.pool(),
      eventAuthority: this.pda.eventAuthority(),
      program: this.program.programId,
    };
  }

  // ------------------------------------------------------------------ reads

  config = () => this.program.account.config.fetch(this.pda.config());
  pool = () => this.program.account.pool.fetch(this.pda.pool());
  harbor = (owner: PublicKey) => this.program.account.harbor.fetchNullable(this.pda.harbor(owner));
  sub = (asset: PublicKey) => this.program.account.sub.fetchNullable(this.pda.sub(asset));
  pendingMint = (index: bigint | number) => this.program.account.pendingMint.fetchNullable(this.pda.pending(index));

  async checkpoints(): Promise<Checkpoints> {
    const acc = await this.connection.getAccountInfo(this.a.checkpoints);
    return new Checkpoints(acc?.data);
  }

  /** Exact amount a claim would pay right now (owed + pending). */
  async claimable(owner: PublicKey, now?: number): Promise<bigint> {
    const [pool, harbor, cps] = await Promise.all([this.pool(), this.harbor(owner), this.checkpoints()]);
    if (!harbor) return 0n;
    const t = BigInt(now ?? Math.floor(Date.now() / 1000));
    return claimableAt(toRewardState(pool.rewards as never), toHarborRewards(harbor.rewards as never), t, cps);
  }

  // ------------------------------------------------------------------ admin

  /** create_account for Checkpoints + initialize. Signers: deployer, checkpoints, collection. */
  async initializeIxs(args: {
    deployer: PublicKey;
    admin: PublicKey;
    treasury: PublicKey;
    params: Params;
    uriBase: string;
    collectionUri: string;
    checkpoints: Keypair;
    collection: Keypair;
    checkpointsRent: number;
  }): Promise<TransactionInstruction[]> {
    const create = SystemProgram.createAccount({
      fromPubkey: args.deployer,
      newAccountPubkey: args.checkpoints.publicKey,
      lamports: args.checkpointsRent,
      space: CHECKPOINTS_SPACE,
      programId: this.program.programId,
    });
    const init = await this.program.methods
      .initialize(args.admin, args.treasury, args.params as never, args.uriBase, args.collectionUri)
      .accountsStrict({
        deployer: args.deployer,
        programData: this.pda.programData(),
        config: this.pda.config(),
        pool: this.pda.pool(),
        vault: this.pda.vault(),
        checkpoints: args.checkpoints.publicKey,
        authority: this.pda.authority(),
        collection: args.collection.publicKey,
        mplCore: MPL_CORE_ID,
        systemProgram: SystemProgram.programId,
        eventAuthority: this.pda.eventAuthority(),
        program: this.program.programId,
      })
      .instruction();
    return [create, init];
  }

  private adminAccounts(admin: PublicKey) {
    return { admin, config: this.pda.config(), eventAuthority: this.pda.eventAuthority(), program: this.program.programId };
  }

  updateConfigIx = (admin: PublicKey, params: Params, treasury: PublicKey, uriBase: string) =>
    this.program.methods.updateConfig(params as never, treasury, uriBase).accountsStrict(this.adminAccounts(admin)).instruction();

  setPauseIx = (admin: PublicKey, mint: boolean, upgrades: boolean) =>
    this.program.methods.setPause(mint, upgrades).accountsStrict(this.adminAccounts(admin)).instruction();

  proposeAdminIx = (admin: PublicKey, newAdmin: PublicKey) =>
    this.program.methods.proposeAdmin(newAdmin).accountsStrict(this.adminAccounts(admin)).instruction();

  acceptAdminIx = (newAdmin: PublicKey) =>
    this.program.methods
      .acceptAdmin()
      .accountsStrict({ newAdmin, config: this.pda.config(), eventAuthority: this.pda.eventAuthority(), program: this.program.programId })
      .instruction();

  // ------------------------------------------------------------------ pool

  fundPoolIx = (funder: PublicKey, lamports: bigint) =>
    this.program.methods
      .fundPool(new BN(lamports.toString()))
      .accountsStrict({ funder, ...this.common(), vault: this.pda.vault(), checkpoints: this.a.checkpoints, systemProgram: SystemProgram.programId })
      .instruction();

  crankIx = () =>
    this.program.methods
      .crank()
      .accountsStrict({ config: this.pda.config(), pool: this.pda.pool(), checkpoints: this.a.checkpoints })
      .instruction();

  settleIx = (owner: PublicKey) =>
    this.program.methods
      .settle()
      .accountsStrict({ config: this.pda.config(), pool: this.pda.pool(), checkpoints: this.a.checkpoints, harbor: this.pda.harbor(owner) })
      .instruction();

  // ------------------------------------------------------------------ minting

  mintCommitIx = (payer: PublicKey, randomness: PublicKey, mintIndex: bigint | number) =>
    this.program.methods
      .mintCommit()
      .accountsStrict({
        payer,
        ...this.common(),
        vault: this.pda.vault(),
        treasury: this.a.treasury,
        checkpoints: this.a.checkpoints,
        randomness,
        pending: this.pda.pending(mintIndex),
        systemProgram: SystemProgram.programId,
      })
      .instruction();

  mintRevealIx = (cranker: PublicKey, mintIndex: bigint | number, minter: PublicKey, randomness: PublicKey) => {
    const asset = this.pda.asset(mintIndex);
    return this.program.methods
      .mintReveal()
      .accountsStrict({
        cranker,
        payer: minter,
        ...this.common(),
        pending: this.pda.pending(mintIndex),
        randomness,
        asset,
        sub: this.pda.sub(asset),
        collection: this.a.collection,
        authority: this.pda.authority(),
        mplCore: MPL_CORE_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  };

  // ------------------------------------------------------------------ harbor

  openHarborIx = (owner: PublicKey) =>
    this.program.methods
      .openHarbor()
      .accountsStrict({ owner, config: this.pda.config(), harbor: this.pda.harbor(owner), systemProgram: SystemProgram.programId })
      .instruction();

  private dockAccounts(owner: PublicKey, asset: PublicKey) {
    return {
      owner,
      ...this.common(),
      checkpoints: this.a.checkpoints,
      harbor: this.pda.harbor(owner),
      sub: this.pda.sub(asset),
      asset,
      collection: this.a.collection,
      authority: this.pda.authority(),
      mplCore: MPL_CORE_ID,
      systemProgram: SystemProgram.programId,
    };
  }

  dockIx = (owner: PublicKey, asset: PublicKey) =>
    this.program.methods.dock().accountsStrict(this.dockAccounts(owner, asset)).instruction();

  undockIx = (owner: PublicKey, asset: PublicKey) =>
    this.program.methods.undock().accountsStrict(this.dockAccounts(owner, asset)).instruction();

  claimIx = (owner: PublicKey) =>
    this.program.methods
      .claim()
      .accountsStrict({ owner, ...this.common(), vault: this.pda.vault(), checkpoints: this.a.checkpoints, harbor: this.pda.harbor(owner) })
      .instruction();

  private feeAccounts(owner: PublicKey) {
    return {
      owner,
      ...this.common(),
      vault: this.pda.vault(),
      treasury: this.a.treasury,
      checkpoints: this.a.checkpoints,
      harbor: this.pda.harbor(owner),
      systemProgram: SystemProgram.programId,
    };
  }

  expandHarborIx = (owner: PublicKey) =>
    this.program.methods.expandHarbor().accountsStrict(this.feeAccounts(owner)).instruction();

  // ------------------------------------------------------------------ upgrades

  reinforceIx = (owner: PublicKey, asset: PublicKey) =>
    this.program.methods
      .reinforce()
      .accountsStrict({ ...this.feeAccounts(owner), sub: this.pda.sub(asset), asset })
      .instruction();

  /** `nextMintIndex` is `pool.mintedCount` at send time; the merged sub is created at that index. */
  mergeIx = (owner: PublicKey, a: PublicKey, b: PublicKey, nextMintIndex: bigint | number) => {
    const newAsset = this.pda.asset(nextMintIndex);
    return this.program.methods
      .merge()
      .accountsStrict({
        ...this.feeAccounts(owner),
        subA: this.pda.sub(a),
        subB: this.pda.sub(b),
        assetA: a,
        assetB: b,
        newAsset,
        newSub: this.pda.sub(newAsset),
        collection: this.a.collection,
        authority: this.pda.authority(),
        mplCore: MPL_CORE_ID,
      })
      .instruction();
  };

  // ------------------------------------------------------------------ expeditions

  expeditionStartIx = (owner: PublicKey, asset: PublicKey, hours: number) =>
    this.program.methods
      .expeditionStart(hours)
      .accountsStrict({
        owner,
        ...this.common(),
        checkpoints: this.a.checkpoints,
        harbor: this.pda.harbor(owner),
        sub: this.pda.sub(asset),
      })
      .instruction();

  expeditionReturnCommitIx = (owner: PublicKey, asset: PublicKey, randomness: PublicKey) =>
    this.program.methods
      .expeditionReturnCommit()
      .accountsStrict({ owner, harbor: this.pda.harbor(owner), sub: this.pda.sub(asset), randomness })
      .instruction();

  expeditionReturnRevealIx = (cranker: PublicKey, asset: PublicKey, owner: PublicKey, randomness: PublicKey) =>
    this.program.methods
      .expeditionReturnReveal()
      .accountsStrict({
        cranker,
        ...this.common(),
        checkpoints: this.a.checkpoints,
        harbor: this.pda.harbor(owner),
        sub: this.pda.sub(asset),
        randomness,
      })
      .instruction();

  // ------------------------------------------------------------------ transactions

  /** Compute budget (measured CU × 1.3) + priority fee + `ixs`, unsigned, with a fresh blockhash. */
  async tx(payer: PublicKey, ixs: TransactionInstruction[], measuredUnits: number, fee: FeeOptions = {}): Promise<VersionedTransaction> {
    const [microLamports, { blockhash }] = await Promise.all([
      estimatePriorityFee(this.connection, writableKeys(ixs), fee),
      this.connection.getLatestBlockhash(),
    ]);
    return compileTx(payer, ixs, measuredUnits, microLamports, blockhash);
  }

  static readonly CU = MEASURED_CU;
}
