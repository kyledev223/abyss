/**
 * Devnet end-to-end with real ORAO VRF randomness.
 *
 *   npm run devnet:e2e            mint (commit → ORAO fulfils → reveal), dock, fund, claim,
 *                                 then send the sub on a 1 h expedition
 *   npm run devnet:e2e -- return  bring it back (commit → ORAO fulfils → reveal), print the find, claim
 *
 * The player keypair lives in client/.devnet/ (gitignored) and is funded from the deployer.
 */
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js';
import {
  AbyssClient,
  MEASURED_CU,
  TIER_NAMES,
  prepareExpeditionReturnCommit,
  prepareExpeditionReturnReveal,
  prepareMintCommit,
  prepareMintReveal,
} from '../src';
import { connection, deployer, devnetPlayer, send, sleep, sol } from './common';

const client = new AbyssClient(connection, 'devnet');
const player = devnetPlayer('player');
const me = deployer();

async function fundPlayer() {
  const bal = await connection.getBalance(player.publicKey);
  if (bal >= 0.6 * LAMPORTS_PER_SOL) return;
  const ix = SystemProgram.transfer({ fromPubkey: me.publicKey, toPubkey: player.publicKey, lamports: LAMPORTS_PER_SOL });
  await send('fund player 1 SOL', await client.tx(me.publicKey, [ix], 1_000), [me]);
}

async function firstRun() {
  await fundPlayer();
  if (!(await client.harbor(player.publicKey))) {
    await send('open harbor', await client.tx(player.publicKey, [await client.openHarborIx(player.publicKey)], MEASURED_CU.openHarbor), [player]);
  }

  console.log('Mint');
  const { mintIndex, request, tx } = await prepareMintCommit(client, player.publicKey);
  await send(`mint commit #${mintIndex} (ORAO request ${request.toBase58()})`, tx, [player]);
  const t0 = Date.now();
  const reveal = await prepareMintReveal(client, player.publicKey, mintIndex); // waits for ORAO
  console.log(`  ORAO fulfilled in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await send('mint reveal', reveal, [player]);
  const asset = client.pda.asset(mintIndex);
  const sub = (await client.sub(asset))!;
  console.log(`  → ${TIER_NAMES[sub.tier]} (depth ${sub.depth}) asset ${asset.toBase58()}`);

  console.log('Dock, fund, claim');
  await send('dock', await client.tx(player.publicKey, [await client.dockIx(player.publicKey, asset)], MEASURED_CU.dock), [player]);
  await send('fund pool 0.05 SOL', await client.tx(me.publicKey, [await client.fundPoolIx(me.publicKey, 50_000_000n)], MEASURED_CU.fundPool), [me]);
  await sleep(20_000);
  const preview = await client.claimable(player.publicKey);
  await send('claim', await client.tx(player.publicKey, [await client.claimIx(player.publicKey)], MEASURED_CU.claim), [player]);
  const harbor = (await client.harbor(player.publicKey))!;
  console.log(`  preview just before: ${sol(preview)} SOL, total claimed: ${sol(BigInt(harbor.totalClaimed.toString()))} SOL`);

  console.log('Expedition');
  await send('expedition start (1 h)', await client.tx(player.publicKey, [await client.expeditionStartIx(player.publicKey, asset, 1)], MEASURED_CU.expeditionStart), [player]);
  console.log(`  Run "npm run devnet:e2e -- return" after ${new Date(Date.now() + 3_600_000).toLocaleTimeString()}.`);
}

async function returnRun() {
  const harbor = await client.harbor(player.publicKey);
  if (!harbor || harbor.expeditionSub.equals(PublicKey.default)) throw new Error('no sub on an expedition');
  const sub = await client.program.account.sub.fetch(harbor.expeditionSub);
  const asset = sub.asset;
  if (Date.now() / 1000 < sub.awayUntil.toNumber()) throw new Error(`still away until ${new Date(sub.awayUntil.toNumber() * 1000).toLocaleTimeString()}`);
  const { tx } = await prepareExpeditionReturnCommit(client, player.publicKey, asset);
  await send('expedition return commit', tx, [player]);
  const reveal = await prepareExpeditionReturnReveal(client, player.publicKey, asset); // waits for ORAO
  await send('expedition return reveal', reveal, [player]);
  const after = (await client.harbor(player.publicKey))!;
  const back = (await client.sub(asset))!;
  console.log(`  boost +${after.rewards.boostExtra} until hour ${after.rewards.boostEndHour}, barnacles ${back.barnacles.toString(2)}`);
  await send('claim', await client.tx(player.publicKey, [await client.claimIx(player.publicKey)], MEASURED_CU.claim), [player]);
}

async function main() {
  await client.load();
  console.log(`Player ${player.publicKey.toBase58()} (${sol(await connection.getBalance(player.publicKey))} SOL)`);
  await (process.argv[2] === 'return' ? returnRun() : firstRun());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
