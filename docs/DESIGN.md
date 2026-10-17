# Abyss Haul — Design

Status: approved 2026-10-16. Launch defaults locked (see §2). This document is the source of truth for
the Anchor program, the off-chain services, and the formulas shown on the Docs page.

Players mint NFT submarines, dock them in a harbor, and earn a pro-rata share (by Depth Rating) of a
reward pool that is refilled by mint and upgrade fees and streamed out over a rolling window.

---

## 1. Principles

- Rewards come only from other players' fees. As a group, players always end at **−30% or worse**
  (the treasury share). The UI and Docs say so plainly.
- Claims, undocking and expedition returns can never be paused.
- No instruction moves lamports out of the pool vault except `claim` to a harbor owner.
- Every displayed number is either read from chain or computed by a formula documented here.

## 2. Locked defaults

Single source: `config/defaults.json` (read by the sim, the program init script, and the frontend).

| Parameter | Value |
|---|---|
| Mint price | 0.25 SOL |
| Pool share (`pool_bps`) | 70% (admin bound: ≥ 50%) |
| Payout window | 12 h (admin bound: 1 h – 7 d) |
| Reinforce | +8% depth per level, max 8 levels, cost = 0.0002 SOL × base depth × 1.25^(L−1) |
| Merge fees (tier i → i+1) | 0.03 / 0.06 / 0.12 / 0.25 / 0.50 SOL |
| Harbor | 4 slots at start, max 24; slot k beyond start costs 0.05 SOL × 1.25^k |
| Supply cap | on **live** subs; merges free room to mint |

| Tier | Odds | Base depth |
|---|---|---|
| Rust Bucket | 50% | 100 |
| Reef Runner | 25% | 220 |
| Kelp Cutter | 13% | 480 |
| Trench Diver | 8% | 1,050 |
| Leviathan | 3.5% | 2,300 |
| The Abyssal One | 0.5% | 5,000 |

Expected depth per mint: 356.9. Each merge (2 → 1, next tier) adds ~9–10% depth. Merged subs reset to
reinforce level 0. Reinforce cost scales with base depth, so reinforce payback is identical for every tier.

On-chain, power-of-growth costs are computed iteratively in bps and **rounded up** (in favour of the pool).

## 3. Accounts and PDA seeds

| Account | Seeds | Contents |
|---|---|---|
| `Config` | `["config"]` | admin (Squads vault), pending_admin, treasury, mint price, pool_bps, window, tier table, reinforce params, merge fees, harbor params, max_live_subs, pause flags (`mint`, `upgrades`), Core collection, bumps |
| `Pool` | `["pool"]` | `rewards: RewardState` (`acc_per_depth: u128`, `total_depth`, `stream_remaining`, `stream_end`, `last_update`, totals deposited/credited/claimed, boost-expiry ring `boost_amount[32]` + `boost_hour[32]`), `minted_count`, `live_subs`, `pending_mints`, `active_harbors`, `total_fees`, `total_to_treasury` |
| `Checkpoints` (zero-copy) | none: keypair account, address bound in `Config.checkpoints` | ring of 720 `(hour: i64, acc_lo: u64, acc_hi: u64)`. At 17 KB it exceeds the 10 KB limit for accounts created by CPI, so it can't be a PDA; it is created by a top-level `create_account` in the initialize transaction and every instruction constrains `address = config.checkpoints` |
| `Vault` | `["vault"]` | program-owned, holds pool lamports only; never drops below rent-exempt minimum |
| `Authority` | `["authority"]` | signer-only PDA: Core collection update authority and `PermanentFreezeDelegate` authority on every sub |
| `Harbor` | `["harbor", owner]` | owner, slots, docked (incl. away), `rewards: HarborRewards` (`depth`, `boost_extra`, `boost_end_hour`, `acc_snapshot: u128`, `owed`), `boost_sub`, `expedition_sub`, `last_expedition_return`, total_claimed |
| `Sub` | `["sub", asset]` | asset, mint_index, tier, level, `base_depth` (tier depth at mint), `depth` (with reinforcement), barnacles, state `Idle \| Docked \| Away \| Returning`, harbor, away_until, away_hours, randomness, seed_slot, committed_at |
| Core asset | `["asset", mint_index (u64 LE)]` | PDA address so a permissionless reveal can create it; merge outputs take the next index too |
| `PendingMint` | `["pending", mint_index (u64 LE)]` | payer, randomness account, seed slot, committed_at; holds the `MINT_RENT_DEPOSIT` |

**Custody.** Every sub is created with a `PermanentFreezeDelegate` held by `Authority`. Docking freezes the
asset in the owner's wallet; undocking thaws it. A permanent delegate (unlike the owner-managed
`FreezeDelegate`) cannot be revoked or removed by the owner, so a docked sub can never be moved out from under
its harbor, and there is no plugin state to repair. The program only freezes on `dock`/`merge` and thaws on
`undock`/`merge`. Stats live in `Sub`, keyed by asset, so they follow the NFT when it is traded while undocked.
Existing subs keep their recorded `depth` when the admin changes tier depths.

**Fee flow.** On every paid action: `pool_bps` → `Vault` (then `deposit`), remainder → treasury directly.
The program never holds treasury funds.

## 4. Reward accounting

### 4.1 Accumulator

```
P = 1e12                                       // u128 fixed-point scale
acc_per_depth += released * P / total_depth
pending(harbor) = harbor.depth * (acc_per_depth - harbor.acc_snapshot) / P
```

`settle(harbor)` runs before any change to a harbor's depth (dock, undock, reinforce, merge, expedition):
`owed += pending; acc_snapshot = acc_per_depth`. `claim` = `settle` then pay `owed`. O(1).

**Overflow bound.** A harbor's depth ≤ `total_depth` at every instant of the interval, so
`depth × Δacc ≤ total_released × P ≤ 1.8e19 × 1e12 = 1.8e31` < u128 max (3.4e38). All math is checked anyway.

**Rounding.** Every rounding favours the vault:
- Accrual credits `acc_delta = floor(released × P / total_depth)`; the uncredited remainder
  `released − ceil(acc_delta × total_depth / P)` is returned to `stream_remaining`, so nothing leaks.
- Per-harbor `pending` is floored; at most 1 lamport per settle stays in the vault as surplus.

### 4.2 Streaming pool — Synthetix rolling reset

```
accrue(now):
  if total_depth == 0:
      if last_update < stream_end: stream_end += now - last_update     // stream PAUSES, nothing lost
  else:
      t = min(now, stream_end)
      if t > last_update and stream_remaining > 0:
          released = (t == stream_end) ? stream_remaining
                   : stream_remaining * (t - last_update) / (stream_end - last_update)
          credit(released)                                               // §4.1
  last_update = now

deposit(amount):
  accrue(now)
  stream_remaining += amount
  stream_end = now + WINDOW
```

Between deposits the payout rate is exactly linear and independent of how often anyone cranks. Each new fee
re-spreads **everything not yet paid** evenly over a fresh window. If fees stop, the pool is fully paid out
exactly one window after the last fee. A window change by the admin takes effect at the next deposit.

`fund_pool` (anyone, 100% to players) uses `top_up` instead: it adds to `stream_remaining` **without** moving
`stream_end` (a fresh window starts only if the stream had ended). Otherwise 1-lamport donations every block
could keep re-spreading the pool and slow everyone's payouts for free.

Displayed rates:
```
stream_rate          = stream_remaining / (stream_end - now)                 // lamports/s
rate_per_depth_day   = stream_rate × 86400 / total_depth
sub_rate_per_day     = rate_per_depth_day × sub_depth
```

### 4.3 Solvency invariant

```
vault.lamports − rent_exempt_min  ≥  stream_remaining + Σ_harbors (owed + pending)
```

Must hold after every instruction. It is the first property test written (§11).

## 5. Expedition boosts (exact expiry, no crank needed)

- One expedition at a time per harbor, and the next may start only **24 h after the previous return**; boosts
  last ≤ 12 h (+ < 1 h snapping) → **at most one active boost per harbor**, kept as harbor fields
  `boost_extra`, `boost_end_hour`, `boost_sub`. (Measuring the cooldown from the return, not the start,
  prevents a late return from overlapping the next boost.)
- Finds (placeholders in `config/defaults.json`, not yet reviewed): boost 45%, barnacle 25%, nothing 30%.
  Boost = **+100% of the sub's depth for 2 h per hour away** (1 h → 2 h, 6 h → 12 h). Expected gain
  0.45 × 2h = 0.9× the earnings lost while away.
- **Boost end times snap up to the next full hour** (a 4 h boost granted at 10:20 ends at 15:00).
- On grant: `Pool.decrease[end_hour % 32] += boost_extra`, `total_depth += boost_extra`.
- `accrue` walks only the ring buckets it crosses (≤ 32 iterations). At each boundary it accrues up to the
  boundary, subtracts the scheduled decrease from `total_depth`, and writes
  `Checkpoints[hour % 720] = (hour, acc_per_depth)`.
- Settling a harbor whose boost has expired:
  `(depth + extra)·(acc_end − snapshot) + depth·(acc_now − acc_end)`, `acc_end` from the checkpoint.
- Undocking, merging, or re-sending the boosted sub cancels the boost early (ring entry and `total_depth`
  reduced immediately).
- The keeper settles boosted harbors shortly after expiry.
- **30-day checkpoint fallback.** Checkpoints are kept for 720 hours. If a harbor with an expired boost is not
  settled by anyone within 30 days, its checkpoint is gone; it is then credited at **base depth only** for the
  whole interval since its last settle (it loses the boost bonus, never base earnings). The unallocated
  amount stays in the vault (solvency is preserved). In practice the keeper makes this unreachable.

The global total is always exact: a boost never earns past its end hour. Away subs earn nothing and add no
depth. Expedition return odds and boost sizes are chosen so the expected value roughly offsets the earnings
lost while away (documented with numbers on the Docs page).

## 6. Instructions

| Instruction | Signer | Paused by | Notes |
|---|---|---|---|
| `initialize(admin, treasury, params, uri_base, collection_uri)` | **program upgrade authority** | – | one-time; checks `ProgramData.upgrade_authority` so nobody can front-run the deploy; creates the Core collection; `Checkpoints` is created in the same tx |
| `update_config(params, treasury, uri_base)` | admin | – | bounds-checked (`Params::validate`) |
| `set_pause(mint, upgrades)` | admin | – | |
| `propose_admin` / `accept_admin` | admin / new admin | – | two-step |
| `fund_pool(amount)` | anyone | never | top-up, 100% to players, no window reset |
| `mint_commit` | user | `mint` | takes the fee **at commit** (no refund path); randomness `seed_slot == slot − 1`, unrevealed; live + pending < cap; prepays `MINT_RENT_DEPOSIT` |
| `mint_reveal` | anyone | never | rolls the tier; asset goes to the minter; caller is reimbursed rent exactly; leftover deposit refunded to the minter |
| `open_harbor` | owner | never | |
| `dock` | owner | `upgrades`* | Core owner check, slot check, freeze, add depth |
| `undock` | owner | never | cancel boost if it is this sub's, remove depth, thaw |
| `claim` | owner | **never** | settle, pay `owed` from the vault (never below rent) |
| `settle`, `crank` | anyone | never | keeper hooks; can only move value into the owner's `owed` |
| `reinforce` | owner | `upgrades` | idle (Core owner) or docked; cost per §2; depth += 8% of base |
| `merge(a, b)` | owner | `upgrades` | same tier, not top; thaw + burn both, mint next tier at level 0 with both barnacle sets; docked if either input was; `live_subs −= 1` |
| `expand_harbor` | owner | `upgrades` | |
| `expedition_start(hours 1–6)` | owner | `upgrades` | docked sub, no active expedition, cooldown passed; sub stops earning |
| `expedition_return_commit` | owner | never | after `away_until`; commits randomness |
| `expedition_return_reveal` | anyone | never | re-docks; applies the find |

\* `dock` is paused with upgrades so a paused game cannot grow; `undock` never is.

All accounts use Anchor seed/owner/signer constraints; zero-copy accounts check discriminators. State changes
precede transfers. Every instruction emits an Anchor event via `emit_cpi!`.

## 7. Randomness

Switchboard On-Demand randomness, commit/reveal. Slot hashes are never used.

- **Commit**: the randomness account must be owned by Switchboard, committed in the previous slot and
  unrevealed. The fee is taken in the same instruction, before the value exists.
- **Reveal**: the account must still carry the committed `seed_slot` and be revealed after it. The stored value
  is read directly; we do not require same-slot consumption, so a reveal sent without our instruction cannot
  strand a paid mint.
- **No re-rolls**: re-committing the randomness account changes its `seed_slot`, so the value no longer counts.
- **Timeout fallback**: with no valid reveal `REVEAL_TIMEOUT` (1 h) after commit, anyone may settle with the
  **worst outcome** (Rust Bucket / no find). A stalled oracle or a closed randomness account can't strand a
  paid mint or a sub at sea, and withholding a reveal never helps the player.
- Mainnet program `SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv`; build with `--features devnet` for
  `Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2`.
- The Core and Switchboard crates target older Solana/Anchor versions, so `src/external/` encodes the few
  instructions and layouts we use directly (from mpl-core 0.12.1 and switchboard-on-demand 0.13.0); the Core
  side is tested against the mainnet Core binary in LiteSVM.

## 8. NFTs and art

Metaplex Core, one collection; `Authority` PDA is the collection update authority.
URI → `/api/meta/[asset]` (JSON) and `/api/art/[asset]` (SVG), generated from the on-chain `Sub`
(tier, level, barnacles) and seeded by the asset pubkey. Procedural vector art; no stock assets.

## 9. Admin and trust

- `Config.admin` and the program **upgrade authority** are held by a Squads v4 multisig with a **time lock**.
- The admin can: change prices/odds/window within bounds, pause minting and upgrades, set the treasury.
- The admin cannot: withdraw from the vault, change anyone's `owed`, pause claims.
- Stated plainly on the Docs page: the upgrade authority can replace the program code, which is why it sits
  behind a time-locked multisig — any upgrade is visible on-chain for the time-lock period before it executes.
  The plan is to make the program immutable once stable.

## 10. Off-chain

- **Hosting:** Vercel (Next.js App Router, TypeScript, Tailwind).
- **RPC:** Helius (`NEXT_PUBLIC_RPC_URL` for the public endpoint; `HELIUS_API_KEY` server-only). Keyed calls
  (priority-fee estimates, enhanced transactions, DAS) go through Next.js API routes.
- **Ledger + mints feed:** Helius webhook → `/api/webhooks/helius` (auth header verified) → Neon Postgres via
  Drizzle. **Idempotent:** unique key `(signature, event_index)`, insert `ON CONFLICT DO NOTHING`, so retries
  and replays never double-count. Aggregates are derived from rows, not incremented counters.
- **Live stats:** read from `Pool` over WebSocket (paid out = `total_claimed`; unclaimed = distributed −
  claimed; in stream = `stream_remaining`; total subs = `live_subs`; active players = `active_harbors`).
- **Fleet registry / leaderboard:** `getProgramAccounts` on `Sub` / `Harbor`, cached.
- **Keeper:** Vercel Cron → `/api/cron/keeper` (protected by `CRON_SECRET`): `crank`, then `settle` every
  harbor whose boost has expired. Signs with a **separate low-balance hot wallet** (`KEEPER_SECRET_KEY`) that has
  no admin rights; it can only call permissionless instructions.
- **Client transactions:** compute-budget limit + priority fee (Helius estimate via proxy) on every tx.
- **Wallets:** Phantom, Solflare, Backpack via wallet adapter.

Env vars: `HELIUS_API_KEY`, `NEXT_PUBLIC_RPC_URL`, `HELIUS_WEBHOOK_SECRET`, `DATABASE_URL`, `KEEPER_SECRET_KEY`,
`CRON_SECRET`, `NEXT_PUBLIC_PROGRAM_ID`.

## 11. Frontend honesty requirements

**Pre-action payback estimate** — shown before every mint, reinforce, and merge:
```
rate_per_depth_day = min(current stream rate, trailing-24h actual payout rate) × 86400 / total_depth
payback_days       = cost / (depth_gain × rate_per_depth_day)
```
- Labelled "Estimate at today's network rate — falls if minting slows."
- Shown as **"never"** when the rate is zero or payback exceeds 5 years.
- Mint uses expected depth (356.9) and shows the per-tier range.
- **Reinforce is presented as a long-term sink, not an earnings boost.** The panel leads with the payback
  ("~100+ days at today's rate, and only if minting continues") and the cost, not the depth gain.

**Docs page** must include:
- Every formula in §4–§5, including the Synthetix rolling reset, hour-snapped boosts, and the 30-day
  checkpoint fallback.
- The cohort-outcome chart, **generated from `sim/cohort-outcomes.json`** (never hand-drawn), with a scenario
  toggle (base, half volume, fast decline, most buyers near the top). Default: the worst case
  (`defaultScenario` in the JSON).
- The per-cohort table (mint week → return by day 120) **under the chart**, for the selected scenario.
- Next to the risk disclaimer: "Players as a group always end at −30% or worse."
- The upgrade-authority / time-lock statement from §9.

## 12. Economics simulation

`sim/economics.mjs` reads `config/defaults.json` and prints per-sub earnings at 100/1k/10k subs, the growth
-rate view, pool drain, merge and reinforce payback, and cohort outcomes for four scenarios; it writes
`sim/cohort-outcomes.json` for the Docs chart. Key results at the locked defaults:

- Average-sub mint payback depends on fleet growth, not size: 143 d at 1%/day, 29 d at 5%/day.
- Reinforce payback at N=1k, 50 mints/day: 102 d (L1) to 486 d (L8), identical for every tier.
- Cohorts: early weeks gain, later weeks lose; group return is −30% in every scenario. Volume alone does not
  change percentages; shape does.

## 13. Testing (before any mainnet deploy)

**Harness: LiteSVM, not Bankrun.** `solana-bankrun` has not been published since Oct 2024 and does not
support the current runtime; LiteSVM is the maintained in-process successor and Anchor 1.x's default test
template. Same model (in-process VM, warpable clock), much faster than `solana-test-validator`. Metaplex
Core and Switchboard On-Demand are loaded into LiteSVM from `solana program dump` of their mainnet binaries.

Layers, in priority order:
1. **Reward engine property tests** (`programs/abyss-haul/tests/solvency_engine.rs`, proptest). The §4–§5
   math lives in a pure module (`src/rewards.rs`) shared by every instruction. Random sequences of deposit /
   dock / undock / claim / boost / cancel / time-warp across many harbors; after every step assert:
   - **Solvency (§4.3):** `deposited − claimed ≥ stream_remaining + Σ(owed + pending)`.
   - **No value leak:** the surplus above is bounded by the number of credits + settles (rounding dust only).
   - **Fairness:** each harbor's earnings match an independent reference model (direct pro-rata split per
     interval, no accumulator) within the same rounding bound.
   - `total_depth` equals the sum of harbor depths plus active boosts.
2. **Reward edge cases** (deterministic): zero subs (stream pauses), one sub (gets everything), claim
   mid-window, full drain exactly one window after the last fee, merge while earning, boost expiry on the hour
   boundary, early cancel, 30-day checkpoint fallback, clock not advancing.
3. **Instruction-level LiteSVM tests**: the solvency invariant again, but against real accounts
   (`vault.lamports − rent_min`); signer/owner/PDA checks per instruction; pause matrix; admin cannot touch
   the vault; commit/reveal cannot be aborted.
4. **Overflow/rounding**: extreme depths and deposits (u64 max-ish), dust accounting.
5. **Devnet end-to-end** with real Switchboard randomness and Core before any mainnet deploy.

## 14. Deployment

Mainnet script: build with `anchor build --verifiable`, `anchor verify`, print program ID, transfer upgrade
authority to the Squads vault, and print the Squads setup steps (members, threshold, time lock). Toolchain runs
in WSL2 Ubuntu; the repo lives at `~/abyss-haul` (not in OneDrive). `scripts/setup-toolchain.sh` reproduces it.

Toolchain (2026-10-16): Anchor 1.2.1 (avm), Solana/Agave CLI 4.1.2 (pinned by Anchor), host Rust 1.97.1
(`rust-toolchain.toml`; needed by LiteSVM 0.18), Node 24 LTS. Programs build as **SBPF v3**, which has been
enabled on mainnet since epoch 993.

**Before mainnet:** independent security audit and legal review (random-tier paid mints with rewards funded by
later players may be treated as gambling or a security in some jurisdictions; geo-restrictions likely).
