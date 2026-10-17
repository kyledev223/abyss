import { storeEvents } from "@/lib/server/db";
import { decodeEvents, type RawTx } from "@/lib/server/events";

/**
 * Helius "raw" webhook for our program address. Set the webhook's auth header to
 * HELIUS_WEBHOOK_SECRET. Idempotent: rows are unique on (signature, event_index), so retries and
 * replays never double-count.
 */
export async function POST(req: Request) {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret || req.headers.get("authorization") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as RawTx[] | RawTx;
  const txs = Array.isArray(body) ? body : [body];
  const decoded = txs.flatMap((tx) => {
    try {
      return decodeEvents(tx);
    } catch {
      return [];
    }
  });
  const inserted = await storeEvents(decoded);
  return Response.json({ received: txs.length, events: decoded.length, inserted });
}
