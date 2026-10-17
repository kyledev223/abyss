const LAMPORTS = 1_000_000_000;

/** Lamports → "1.2345 SOL" with sensible precision. */
export function sol(lamports: bigint | number | string, digits?: number): string {
  const n = Number(lamports) / LAMPORTS;
  const d = digits ?? (n === 0 ? 0 : Math.abs(n) >= 100 ? 2 : Math.abs(n) >= 1 ? 3 : Math.abs(n) >= 0.01 ? 4 : 6);
  return `${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })} SOL`;
}

export const short = (addr: string, n = 4) => `${addr.slice(0, n)}…${addr.slice(-n)}`;

export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 48) return `${Math.round(h / 24)} days`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

export function ago(unix: number | null, now = Date.now() / 1000): string {
  if (!unix) return "just now";
  const d = now - unix;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return `${Math.floor(d / 86400)} days ago`;
}

export function paybackText(days: number | "never"): string {
  if (days === "never") return "never at today's rate";
  if (days < 1) return "under a day at today's rate";
  return `about ${Math.round(days).toLocaleString("en-US")} days at today's rate`;
}
