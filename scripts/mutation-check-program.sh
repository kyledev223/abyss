#!/usr/bin/env bash
# Plants known bugs in the instruction handlers one at a time, rebuilds the SBF program, and checks
# that the LiteSVM tests catch each one. Slower than mutation-check.sh (a rebuild per mutant).
# Usage: scripts/mutation-check-program.sh
set -uo pipefail
cd "$(dirname "$0")/.."
SRC=programs/abyss-haul/src
BACKUP=$(mktemp -d)
cp -r "$SRC" "$BACKUP/"
restore() { rm -rf "$SRC"; cp -r "$BACKUP/src" "$SRC"; }
trap 'restore; rm -rf "$BACKUP"; anchor build --no-idl >/dev/null 2>&1' EXIT

# name|file (under src/)|literal search|literal replacement
MUTANTS=(
  "dock does not freeze the asset|instructions/harbor.rs|        true,\n        &[&[AUTHORITY_SEED|        false,\n        &[&[AUTHORITY_SEED"
  "dock skips the ownership check|instructions/harbor.rs|    require_keys_eq!(\n        core::asset_owner(&a.asset, &a.config.collection)?,\n        a.owner.key(),\n        ErrorCode::NotOwner\n    );|"
  "claim pays out twice the amount|ops.rs|    let left = vault.lamports().checked_sub(amount)|    let amount = amount * 2;\n    let left = vault.lamports().checked_sub(amount)"
  "fee reaches the vault but not the stream|ops.rs|    pool.rewards.deposit(to_pool, now, params.window, cps)?;|"
  "undock leaves the boost running|instructions/harbor.rs|        if a.harbor.boost_sub == a.sub.key() {\n            a.pool.rewards.cancel_boost|        if false {\n            a.pool.rewards.cancel_boost"
  "mint ignores the pause|instructions/mint.rs|    require!(!a.config.paused_mint, ErrorCode::MintPaused);|"
  "reveal falls back without waiting|instructions/mint.rs|            require!(\n                now >= a.pending.committed_at.saturating_add(REVEAL_TIMEOUT),\n                ErrorCode::RandomnessNotRevealed\n            );|"
  "reveal accepts re-committed randomness|external/switchboard.rs|(r.seed_slot == committed_seed_slot && r.reveal_slot > r.seed_slot)|(r.reveal_slot > r.seed_slot)"
  "merge keeps the burned subs' depth|instructions/upgrade.rs|            a.pool.rewards.remove_depth(&mut a.harbor.rewards, sub.depth, now, &mut *cps)?;|"
  "expedition keeps earning while away|instructions/expedition.rs|        a.pool.rewards.remove_depth(&mut a.harbor.rewards, a.sub.depth, now, &mut *cps)?;\n    }|    }"
)

survived=0
for m in "${MUTANTS[@]}"; do
  IFS='|' read -r name file search replace <<<"$m"
  restore
  python3 - "$SRC/$file" "$search" "$replace" <<'PY'
import sys
path, search, replace = sys.argv[1], sys.argv[2].replace('\\n', '\n'), sys.argv[3].replace('\\n', '\n')
src = open(path).read()
assert src.count(search) == 1, f"mutation anchor not found exactly once in {path}: {search!r}"
open(path, 'w').write(src.replace(search, replace))
PY
  if ! anchor build --no-idl >/dev/null 2>&1; then
    echo "killed    $name (does not compile)"
    continue
  fi
  if PROPTEST_CASES=24 cargo test -q -p abyss-haul --test program_flows --test solvency_program >/dev/null 2>&1; then
    echo "SURVIVED  $name"; survived=$((survived + 1))
  else
    echo "killed    $name"
  fi
done
echo "$survived mutant(s) survived"
exit $survived
