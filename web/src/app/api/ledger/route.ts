import { db, latestEvents } from "@/lib/server/db";
import { recentEventsFromRpc } from "@/lib/server/events";
import { programReady } from "@/lib/server/chain";

export const dynamic = "force-dynamic";

/**
 * Public ledger of program events (mints, fees, claims…). From Postgres when the Helius webhook is
 * set up, otherwise straight from recent transactions. `?name=SubMinted` filters by event.
 */
export async function GET(req: Request) {
  if (!(await programReady())) return Response.json({ ready: false, source: "none", events: [] });
  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? undefined;
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));
  const events = db
    ? await latestEvents(limit, name)
    : (await recentEventsFromRpc(Math.min(limit, 40))).filter((e) => !name || e.name === name);
  return Response.json(
    { ready: true, source: db ? "database" : "rpc", events },
    { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=30" } },
  );
}
