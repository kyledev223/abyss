import { PublicKey } from "@solana/web3.js";
import { renderSub } from "@/lib/art";
import { serverClient } from "@/lib/server/chain";

export const dynamic = "force-dynamic";

/** SVG art for a sub, drawn from its on-chain stats. */
export async function GET(_req: Request, ctx: { params: Promise<{ asset: string }> }) {
  const { asset } = await ctx.params;
  let key: PublicKey;
  try {
    key = new PublicKey(asset);
  } catch {
    return new Response("Not a valid address", { status: 400 });
  }
  const sub = await serverClient().sub(key);
  if (!sub) return new Response("No sub with that address", { status: 404 });
  const svg = renderSub({ seed: key.toBytes(), tier: sub.tier, level: sub.level, barnacles: sub.barnacles });
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml",
      // Stats change on reinforce and on new barnacles; let CDNs refresh within minutes.
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
