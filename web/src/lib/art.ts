/**
 * Procedural submarine art. Deterministic: the same asset address + stats always draw the same sub.
 * - tier       → hull palette, porthole count, depth of the water behind it, searchlight
 * - level      → hull seams, rivet rows, an armour band from level 6
 * - barnacles  → one cluster per set bit (16 spots along the hull)
 * - seed       → hull proportions, tower placement, fins, propeller, plankton field
 * Only numbers go into the SVG, never user text, so the output needs no escaping.
 */

export interface SubArt {
  seed: Uint8Array; // the asset address bytes
  tier: number;
  level: number;
  barnacles: number;
}

interface Palette {
  water: [string, string];
  hull: string;
  hullShade: string;
  trim: string;
  glow: string;
  plankton: number;
}

const PALETTES: Palette[] = [
  // Rust Bucket: patched, shallow water
  { water: ["#0f4450", "#072a33"], hull: "#9a5634", hullShade: "#6b3820", trim: "#d8a065", glow: "#ffd9a0", plankton: 10 },
  // Reef Runner: teal hull, coral stripe
  { water: ["#0c3d48", "#06232b"], hull: "#2f7478", hullShade: "#1d4f52", trim: "#ff8a7a", glow: "#ffe1c4", plankton: 18 },
  // Kelp Cutter: kelp green, saw-tooth planes
  { water: ["#0a3340", "#041c24"], hull: "#3f6e3c", hullShade: "#284a27", trim: "#a8cf72", glow: "#e6ffb0", plankton: 26 },
  // Trench Diver: pressure-steel blue, searchlight
  { water: ["#072833", "#03141b"], hull: "#3c5674", hullShade: "#26384f", trim: "#a7c0de", glow: "#cfe8ff", plankton: 34 },
  // Leviathan: abyssal violet, bioluminescent trim
  { water: ["#051c26", "#020c11"], hull: "#2e2550", hullShade: "#1b1533", trim: "#b996ff", glow: "#d9c4ff", plankton: 44 },
  // The Abyssal One: black hull drawn in light
  { water: ["#03121a", "#010508"], hull: "#060d12", hullShade: "#020508", trim: "#7cf5da", glow: "#7cf5da", plankton: 60 },
];

/** mulberry32 seeded from the first 4 bytes, mixed with the rest. */
function rng(seed: Uint8Array) {
  let h = 0x9e3779b9;
  for (const b of seed) h = Math.imul(h ^ b, 0x85ebca6b) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

export function renderSub({ seed, tier, level, barnacles }: SubArt): string {
  const p = PALETTES[Math.max(0, Math.min(5, tier))];
  const r = rng(seed);
  const between = (a: number, b: number) => a + r() * (b - a);

  // Hull geometry
  const L = between(290, 345); // length
  const H = between(84, 104); // height
  const cx = 262;
  const cy = 278;
  const x0 = cx - L / 2;
  const x1 = cx + L / 2;
  const top = cy - H / 2;
  const bot = cy + H / 2;
  const nose = H / 2;
  const tail = between(46, 70);

  const parts: string[] = [];
  const defs: string[] = [];
  const id = Array.from(seed.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");

  defs.push(
    `<radialGradient id="w${id}" cx="50%" cy="28%" r="85%"><stop offset="0" stop-color="${p.water[0]}"/><stop offset="1" stop-color="${p.water[1]}"/></radialGradient>`,
    `<linearGradient id="h${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.hull}"/><stop offset="1" stop-color="${p.hullShade}"/></linearGradient>`,
    `<radialGradient id="g${id}"><stop offset="0" stop-color="${p.glow}" stop-opacity=".95"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="s${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${p.glow}" stop-opacity=".35"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></linearGradient>`,
  );

  // Water and plankton
  parts.push(`<rect width="512" height="512" fill="url(#w${id})"/>`);
  for (let i = 0; i < p.plankton; i++) {
    const x = between(0, 512);
    const y = between(0, 512);
    const rad = between(0.6, tier >= 4 ? 2.4 : 1.6);
    parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" fill="${p.glow}" opacity="${f(between(0.15, 0.6))}"/>`);
  }

  // Searchlight from the nose (Trench Diver and deeper)
  if (tier >= 3) {
    const spread = between(70, 110);
    parts.push(`<path d="M${f(x1 - 6)} ${f(cy - 6)} L512 ${f(cy - spread)} L512 ${f(cy + spread * 0.6)} Z" fill="url(#s${id})"/>`);
  }

  // Propeller and tail cone
  const px = x0 - tail;
  const blades = 2 + Math.floor(r() * 3);
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + r();
    const bx = px - 4 + Math.cos(a) * 6;
    parts.push(`<ellipse cx="${f(bx)}" cy="${f(cy + Math.sin(a) * 22)}" rx="5" ry="${f(between(16, 22))}" fill="${p.hullShade}" stroke="${p.trim}" stroke-width="1.5" opacity=".9"/>`);
  }
  parts.push(`<path d="M${f(x0 + nose * 0.6)} ${f(top + 6)} L${f(px)} ${f(cy - 12)} L${f(px)} ${f(cy + 12)} L${f(x0 + nose * 0.6)} ${f(bot - 6)} Z" fill="${p.hullShade}"/>`);

  // Rear fins
  const fin = between(26, 42);
  parts.push(
    `<path d="M${f(x0 + 10)} ${f(top + 8)} L${f(x0 - tail * 0.7)} ${f(top - fin)} L${f(x0 - tail * 0.35)} ${f(top + 10)} Z" fill="${p.hullShade}" stroke="${p.trim}" stroke-width="1.5"/>`,
    `<path d="M${f(x0 + 10)} ${f(bot - 8)} L${f(x0 - tail * 0.7)} ${f(bot + fin)} L${f(x0 - tail * 0.35)} ${f(bot - 10)} Z" fill="${p.hullShade}" stroke="${p.trim}" stroke-width="1.5"/>`,
  );

  // Conning tower and periscope
  const tw = between(58, 84);
  const th = between(38, 56);
  const tx = cx + between(-0.12, 0.08) * L - tw / 2;
  parts.push(
    `<rect x="${f(tx)}" y="${f(top - th + 10)}" width="${f(tw)}" height="${f(th)}" rx="${f(Math.min(14, tw / 3))}" fill="url(#h${id})" stroke="${p.trim}" stroke-width="2"/>`,
    `<path d="M${f(tx + tw * 0.68)} ${f(top - th + 10)} V${f(top - th - between(16, 30))} H${f(tx + tw * 0.68 + between(10, 16))}" fill="none" stroke="${p.trim}" stroke-width="3" stroke-linecap="round"/>`,
  );

  // Hull
  parts.push(`<rect x="${f(x0)}" y="${f(top)}" width="${f(L)}" height="${f(H)}" rx="${f(nose)}" fill="url(#h${id})" stroke="${p.trim}" stroke-width="2.5"/>`);

  // Tier-specific trim
  if (tier === 1) {
    parts.push(`<rect x="${f(x0 + nose)}" y="${f(cy + H * 0.12)}" width="${f(L - nose * 2)}" height="${f(H * 0.12)}" fill="${p.trim}" opacity=".85"/>`);
  }
  if (tier === 2) {
    const teeth = 7;
    let d = `M${f(x1 - nose * 0.4)} ${f(bot - 4)}`;
    for (let i = 0; i <= teeth; i++) d += ` L${f(x1 - nose * 0.4 + 18 + (i % 2) * 10)} ${f(bot - 4 - (i * (H - 8)) / teeth)}`;
    parts.push(`<path d="${d}" fill="none" stroke="${p.trim}" stroke-width="2.5" stroke-linejoin="round"/>`);
  }
  if (tier === 0) {
    for (let i = 0; i < 3; i++) {
      const w = between(22, 40);
      parts.push(`<rect x="${f(between(x0 + nose, x1 - nose - w))}" y="${f(between(top + 8, bot - 26))}" width="${f(w)}" height="${f(between(14, 20))}" fill="${p.hullShade}" stroke="${p.trim}" stroke-width="1" stroke-dasharray="3 2"/>`);
    }
  }
  if (tier >= 4) {
    parts.push(`<path d="M${f(x0 + nose)} ${f(cy - H * 0.22)} H${f(x1 - nose)}" stroke="${p.trim}" stroke-width="2" opacity=".75"/>`);
    parts.push(`<path d="M${f(x0 + nose)} ${f(cy + H * 0.26)} H${f(x1 - nose)}" stroke="${p.trim}" stroke-width="1.2" opacity=".5"/>`);
  }

  // Reinforcement: seams per level, rivets from level 4, armour band from level 6
  const lv = Math.max(0, Math.min(20, level));
  for (let i = 1; i <= lv; i++) {
    const x = x0 + nose * 0.8 + ((L - nose * 1.6) * i) / (lv + 1);
    parts.push(`<path d="M${f(x)} ${f(top + 3)} V${f(bot - 3)}" stroke="${p.hullShade}" stroke-width="2" opacity=".9"/>`);
  }
  if (lv >= 4) {
    const n = Math.floor((L - nose * 2) / 14);
    for (let i = 0; i < n; i++) {
      const x = x0 + nose + 7 + i * 14;
      parts.push(`<circle cx="${f(x)}" cy="${f(top + 9)}" r="1.8" fill="${p.trim}" opacity=".8"/><circle cx="${f(x)}" cy="${f(bot - 9)}" r="1.8" fill="${p.trim}" opacity=".8"/>`);
    }
  }
  if (lv >= 6) {
    parts.push(`<rect x="${f(cx + L * 0.18)}" y="${f(top + 1)}" width="16" height="${f(H - 2)}" fill="${p.trim}" opacity=".35"/>`);
  }

  // Portholes: tier + 2, glowing, spaced at least ~30 px apart
  const holes = tier + 2;
  const span = Math.min(L * 0.66, holes * 34);
  for (let i = 0; i < holes; i++) {
    const x = cx + L * 0.08 - span / 2 + (span * (i + 0.5)) / holes;
    const rad = between(7, 9.5);
    parts.push(
      `<circle cx="${f(x)}" cy="${f(cy - 4)}" r="${f(rad * 2.2)}" fill="url(#g${id})" opacity="${tier >= 4 ? 0.9 : 0.5}"/>`,
      `<circle cx="${f(x)}" cy="${f(cy - 4)}" r="${f(rad)}" fill="${p.glow}" stroke="${p.trim}" stroke-width="2.5"/>`,
    );
  }

  // Front dive plane, hanging below the bow
  const planeX = x1 - nose * 1.3;
  parts.push(`<path d="M${f(planeX)} ${f(bot - 2)} l${f(between(24, 34))} ${f(between(12, 18))} l${f(-between(30, 40))} 0 Z" fill="${p.hullShade}" stroke="${p.trim}" stroke-width="1.5"/>`);

  // Barnacles: bit i → spot i (0–7 along the top edge, 8–15 along the bottom)
  for (let i = 0; i < 16; i++) {
    if (!((barnacles >> i) & 1)) continue;
    const onTop = i < 8;
    const x = x0 + nose * 0.7 + ((L - nose * 1.4) * ((i % 8) + 0.5)) / 8;
    const y = onTop ? top + 4 : bot - 4;
    for (let k = 0; k < 3; k++) {
      const bx = x + (k - 1) * 7 + between(-2, 2);
      const by = y + (onTop ? -1 : 1) * between(0, 4);
      parts.push(`<path d="M${f(bx - 4)} ${f(by)} L${f(bx)} ${f(by + (onTop ? -8 : 8))} L${f(bx + 4)} ${f(by)} Z" fill="#e9e1cc" stroke="#9c9077" stroke-width="1"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
}

/** Collection image: three silhouettes in formation. */
export function renderCollection(): string {
  const seeds = [1, 2, 3].map((n) => Uint8Array.from([n, n * 7, n * 13, n * 29]));
  const inner = seeds
    .map((seed, i) =>
      renderSub({ seed, tier: [0, 3, 5][i], level: i * 3, barnacles: 0 })
        .replace(/^<svg[^>]*>/, "")
        .replace(/<\/svg>$/, ""),
    )
    .map((g, i) => `<g transform="translate(${[-40, 120, 20][i]} ${[-120, 10, 150][i]}) scale(.55)">${g}</g>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="#03141a"/>${inner}</svg>`;
}
