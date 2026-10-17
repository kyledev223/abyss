import { fleetSnapshot, programReady } from "@/lib/server/chain";

export const dynamic = "force-dynamic";

/** Every sub (`?owner=` filters to one wallet; `?fresh` skips the 15 s cache after an action). */
export async function GET(req: Request) {
  if (!(await programReady())) return Response.json({ ready: false, subs: [], harbors: [] });
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner");
  const snap = await fleetSnapshot(url.searchParams.has("fresh") ? 0 : 15_000);
  const subs = owner ? snap.subs.filter((s) => s.owner === owner) : snap.subs;
  const harbors = owner ? snap.harbors.filter((h) => h.owner === owner) : snap.harbors;
  return Response.json(
    { ready: true, subs, harbors, asOf: snap.at },
    { headers: { "cache-control": owner ? "no-store" : "public, s-maxage=15, stale-while-revalidate=60" } },
  );
}
