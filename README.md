# Abyss Haul

An idle collection game on Solana: players mint procedurally drawn NFT submarines, dock them in a harbor,
and earn a share of a fee pool by Depth Rating.

> **Status: in development. Not audited, not deployed to mainnet.** Rewards come only from other players'
> fees; as a group, players always end at −30% or worse. See [docs/DESIGN.md](docs/DESIGN.md).

## Layout

| Path | What |
|---|---|
| `programs/abyss-haul/` | Anchor program (rewards engine in `src/rewards.rs`, instructions in `src/instructions/`) |
| `programs/abyss-haul/tests/` | Engine property tests, LiteSVM instruction tests, transaction-level solvency fuzz |
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
```
