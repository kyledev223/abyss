import { PublicKey } from "@solana/web3.js";
import { SITE_URL } from "@/lib/config";
import { TIERS, serverClient } from "@/lib/server/chain";

export const dynamic = "force-dynamic";

/** Metaplex-style JSON metadata; the asset's URI points here (uri_base + asset address). */
export async function GET(_req: Request, ctx: { params: Promise<{ asset: string }> }) {
  const { asset } = await ctx.params;
  let key: PublicKey;
  try {
    key = new PublicKey(asset);
  } catch {
    return Response.json({ error: "Not a valid address" }, { status: 400 });
  }
  const sub = await serverClient().sub(key);
  if (!sub) return Response.json({ error: "No sub with that address" }, { status: 404 });
  const barnacles = sub.barnacles.toString(2).split("").filter((b) => b === "1").length;
  return Response.json(
    {
      name: `Abyss Haul #${sub.mintIndex.toNumber() + 1}`,
      symbol: "HAUL",
      description: `${TIERS[sub.tier]}, Depth Rating ${sub.depth.toString()}. A submarine in the Abyss Haul fleet.`,
      image: `${SITE_URL}/api/art/${asset}`,
      external_url: `${SITE_URL}/fleet?sub=${asset}`,
      attributes: [
        { trait_type: "Tier", value: TIERS[sub.tier] },
        { trait_type: "Depth Rating", value: sub.depth.toNumber() },
        { trait_type: "Reinforce level", value: sub.level },
        { trait_type: "Barnacles", value: barnacles },
      ],
      properties: { files: [{ uri: `${SITE_URL}/api/art/${asset}`, type: "image/svg+xml" }], category: "image" },
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=300" } },
  );
}
