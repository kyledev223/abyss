# Abyss Haul

An idle collection game on Solana: players mint procedurally drawn NFT submarines, dock them in a harbor,
and earn a share of a fee pool by Depth Rating.

> **Status: in development. Not audited, not deployed to mainnet.** Rewards come only from other players'
> fees; as a group, players always end at −30% or worse. See [docs/DESIGN.md](docs/DESIGN.md).

## Layout

| Path | What |
|---|---|
| `programs/abyss-haul/` | Anchor program (rewards engine in `src/rewards.rs`, instructions in `src/instructions/`) |
| `programs/abyss-haul/tests/` | Engine property tests, LiteSVM instruction tests (real Metaplex Core + ORAO VRF binaries), transaction-level solvency fuzz |
| `client/` | TypeScript client: instruction builders, exact reward preview, ORAO flows, devnet scripts |
| `web/` | Next.js site: landing, shipyard, harbor, fleet, ledger, leaderboard, docs; art/metadata API, Helius webhook, daily keeper |
| `config/defaults.json` | Launch economics — single source for the program init, sim and frontend |
| `sim/economics.mjs` | Economics simulation; writes `sim/cohort-outcomes.json` for the Docs page |
| `docs/DESIGN.md` | Accounts, formulas, invariants, and every design decision |
| `scripts/` | Toolchain setup and mutation checks |

## Build and test (WSL2 Ubuntu / Linux)

```sh
scripts/setup-toolchain.sh        # Rust, Solana/Agave CLI, Anchor (avm), Node
anchor build
cargo test -p abyss-haul           # all suites
PROPTEST_CASES=2000 cargo test --release -p abyss-haul --test solvency_program
scripts/mutation-check.sh          # engine: planted bugs must be caught
scripts/mutation-check-program.sh  # instructions: planted bugs must be caught
node sim/economics.mjs
(cd client && npm install && npm run sync-idl && npm test)
scripts/deploy-devnet.sh           # needs ~5 devnet SOL; then: (cd client && npm run devnet:e2e)
```

## Website (free tiers)

```sh
cd web && cp .env.example .env.local   # fill in what you have; every value is optional on devnet
npm install && npm run dev
```

Deploy `web/` to Vercel (Hobby is fine for the devnet play-money version; root directory `web`).
Optional free add-ons: a Helius key (RPC, priority fees, a "raw" webhook on the program address
pointing at `/api/webhooks/helius`) and a Neon database (`npx drizzle-kit push`) for the full ledger.
The daily keeper is in `web/vercel.json`.

Randomness comes from [ORAO VRF](https://github.com/orao-network/solana-vrf). (Switchboard, the original
choice, shut down in September 2026; see `docs/DESIGN.md` §7.)
