import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';

export const RPC_URL = process.env.DEVNET_RPC_URL ?? 'https://api.devnet.solana.com';
export const connection = new Connection(RPC_URL, 'confirmed');

export function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

/** The Solana CLI wallet: deployer, upgrade authority and (on devnet only) admin + treasury. */
export const deployer = () => loadKeypair(process.env.DEPLOYER_KEYPAIR ?? `${homedir()}/.config/solana/id.json`);

/** A throwaway player kept in client/.devnet/ (gitignored). */
export function devnetPlayer(name: string): Keypair {
  const dir = fileURLToPath(new URL('../.devnet/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const path = `${dir}${name}.json`;
  if (!existsSync(path)) writeFileSync(path, JSON.stringify([...Keypair.generate().secretKey]));
  return loadKeypair(path);
}

export async function send(label: string, tx: VersionedTransaction, signers: Keypair[]): Promise<string> {
  tx.sign(signers);
  const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  if (res.value.err) {
    const logs = (await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 }))?.meta?.logMessages;
    throw new Error(`${label} failed: ${JSON.stringify(res.value.err)}\n${logs?.join('\n') ?? ''}`);
  }
  console.log(`  ✓ ${label}  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  return sig;
}

export const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
export const sol = (lamports: bigint | number) => (Number(lamports) / 1e9).toFixed(6);
