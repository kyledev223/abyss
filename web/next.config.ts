import path from "node:path";
import type { NextConfig } from "next";

// The shared client (../client) is imported as source. Its imports of these libraries must resolve
// to web/node_modules: on Vercel only web/ is installed, and locally client/ has its own copies
// (for its tests) that would otherwise give two PublicKey / BN classes. Builds use webpack because
// its absolute-path aliases are reliable; Turbopack's alias resolution failed from a clean clone.
const SHARED = ["@solana/web3.js", "@anchor-lang/core", "bn.js", "@noble/hashes"];

const nextConfig: NextConfig = {
  transpilePackages: ["@abyss-haul/client"],
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  webpack: (config) => {
    for (const p of SHARED) config.resolve.alias[p] = path.resolve(__dirname, "node_modules", p);
    return config;
  },
};

export default nextConfig;
