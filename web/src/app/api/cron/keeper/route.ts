import { MEASURED_CU } from "@abyss-haul/client";
import { Keypair } from "@solana/web3.js";
import { serverClient } from "@/lib/server/chain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily keeper (Vercel Cron, see vercel.json). Boosts already end exactly on their hour without
 * any transaction; this only settles harbors whose boost has expired so their checkpoint is used
 * well inside the 30-day window, then cranks the stream once.
 *
 * Signs with KEEPER_SECRET_KEY: a separate, low-balance hot wallet with no admin rights. It can only
 * call permissionless instructions, which can only ever credit harbor owners.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const secret = process.env.KEEPER_SECRET_KEY;
  if (!secret) return Response.json({ error: "KEEPER_SECRET_KEY is not set" }, { status: 500 });
  const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));

  const client = serverClient();
  await client.load();
  const now = Math.floor(Date.now() / 1000);
  const harbors = await client.program.account.harbor.all();
  const expired = harbors.filter(
    (h) => h.account.rewards.boostExtra.toNumber() > 0 && h.account.rewards.boostEndHour.toNumber() * 3600 <= now,
  );

  const sent: string[] = [];
  const settleIxs = await Promise.all(expired.map((h) => client.settleIx(h.account.owner)));
  const batches = [[await client.crankIx()], ...chunk(settleIxs, 6)];
  for (const ixs of batches) {
    const tx = await client.tx(keeper.publicKey, ixs, MEASURED_CU.settle * ixs.length + MEASURED_CU.crank);
    tx.sign([keeper]);
    sent.push(await client.connection.sendRawTransaction(tx.serialize()));
  }
  return Response.json({ settled: expired.length, transactions: sent });
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
