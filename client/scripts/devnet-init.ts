/**
 * Initializes Config/Pool/Vault/Checkpoints and the Core collection on devnet. Idempotent.
 * On devnet the deployer is also admin and treasury; on mainnet admin is the Squads vault.
 */
import { Keypair } from '@solana/web3.js';
import { AbyssClient, CHECKPOINTS_SPACE, MEASURED_CU, launchParams } from '../src';
import { connection, deployer, send } from './common';

const URI_BASE = process.env.URI_BASE ?? 'https://abyss-haul.vercel.app/api/meta/';
const COLLECTION_URI = process.env.COLLECTION_URI ?? 'https://abyss-haul.vercel.app/api/collection';

async function main() {
  const client = new AbyssClient(connection, 'devnet');
  const me = deployer();
  if (await client.program.account.config.fetchNullable(client.pda.config())) {
    const a = await client.load();
    console.log('Already initialized:', { config: client.pda.config().toBase58(), ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.toBase58()])) });
    return;
  }
  const checkpoints = Keypair.generate();
  const collection = Keypair.generate();
  const ixs = await client.initializeIxs({
    deployer: me.publicKey,
    admin: me.publicKey,
    treasury: me.publicKey,
    params: launchParams(),
    uriBase: URI_BASE,
    collectionUri: COLLECTION_URI,
    checkpoints,
    collection,
    checkpointsRent: await connection.getMinimumBalanceForRentExemption(CHECKPOINTS_SPACE),
  });
  await send('initialize', await client.tx(me.publicKey, ixs, MEASURED_CU.initialize), [me, checkpoints, collection]);
  console.log({
    program: client.program.programId.toBase58(),
    config: client.pda.config().toBase58(),
    collection: collection.publicKey.toBase58(),
    checkpoints: checkpoints.publicKey.toBase58(),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
