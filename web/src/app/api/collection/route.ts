import { renderCollection } from "@/lib/art";
import { SITE_URL } from "@/lib/config";

/** Collection metadata (`?image` returns the collection art). */
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.has("image")) {
    return new Response(renderCollection(), {
      headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
    });
  }
  return Response.json({
    name: "Abyss Haul Fleet",
    symbol: "HAUL",
    description: "Procedurally drawn submarines that haul up a share of a fee pool. Every formula is public.",
    image: `${SITE_URL}/api/collection?image`,
    external_url: SITE_URL,
  });
}
