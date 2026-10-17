import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.resolve(__dirname, "..");

// The shared client (../client) has its own node_modules for its tests. Force one copy of the
// Solana libraries so PublicKey / BN instances are interchangeable between the app and the client.
const SHARED = ["@solana/web3.js", "@anchor-lang/core", "bn.js"];

const nextConfig: NextConfig = {
  transpilePackages: ["@abyss-haul/client"],
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
    // Turbopack aliases are relative to `root`.
    resolveAlias: Object.fromEntries(SHARED.map((p) => [p, `./web/node_modules/${p}`])),
  },
  webpack: (config) => {
    for (const p of SHARED) config.resolve.alias[p] = path.resolve(__dirname, "node_modules", p);
    return config;
  },
};

export default nextConfig;
