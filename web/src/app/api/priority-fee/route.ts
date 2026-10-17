import { CLUSTER } from "@/lib/config";

/**
 * Proxies Helius getPriorityFeeEstimate so HELIUS_API_KEY stays on the server.
 * POST { accountKeys: string[] } → { microLamports }. Without a key it returns 503 and the client
 * falls back to getRecentPrioritizationFees.
 */
export async function POST(req: Request) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return Response.json({ error: "No priority fee service configured" }, { status: 503 });
  const { accountKeys } = (await req.json()) as { accountKeys?: string[] };
  if (!Array.isArray(accountKeys) || accountKeys.length > 64) {
    return Response.json({ error: "accountKeys must be an array of up to 64 addresses" }, { status: 400 });
  }
  const res = await fetch(`https://${CLUSTER === "mainnet" ? "mainnet" : "devnet"}.helius-rpc.com/?api-key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getPriorityFeeEstimate",
      params: [{ accountKeys, options: { priorityLevel: "Medium" } }],
    }),
  });
  const json = (await res.json()) as { result?: { priorityFeeEstimate?: number } };
  const estimate = json.result?.priorityFeeEstimate;
  if (typeof estimate !== "number") return Response.json({ error: "No estimate available" }, { status: 502 });
  return Response.json({ microLamports: Math.ceil(estimate) });
}
