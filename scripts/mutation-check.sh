#!/usr/bin/env bash
# Plants known bugs in the reward engine one at a time and checks that the property test catches
# each one. A mutant that survives means the tests have a blind spot.
# Usage: scripts/mutation-check.sh [cargo test filters...]   (default: all engine test files)
set -uo pipefail
cd "$(dirname "$0")/.."
FILE=programs/abyss-haul/src/rewards.rs
TESTS=("${@:---test solvency_engine --test rewards_edge_cases}")
read -ra TESTS <<<"${TESTS[*]}"
BACKUP=$(mktemp)
cp "$FILE" "$BACKUP"
trap 'cp "$BACKUP" "$FILE"; rm -f "$BACKUP"' EXIT

# name|literal search|literal replacement
MUTANTS=(
  "reserve floor instead of ceil|.div_ceil(ACC_PRECISION)|/ ACC_PRECISION"
  "boost expiry never lowers total_depth|self.total_depth = sub(self.total_depth, self.boost_amount[i])?;|"
  "stream does not pause at zero depth|.checked_add(t - self.last_update)|.checked_add(0)"
  "checkpoint ignored (always fallback)|Some(acc_end) if acc_end|Some(acc_end) if false && acc_end"
  "deposit uses double window|now.checked_add(window)|now.checked_add(window * 2)"
  "claim does not zero owed|h.owed = 0;\n        self.total_claimed|self.total_claimed"
  "boost end rounds down|+ i64::from(end.rem_euclid(HOUR) != 0)|"
  "expired-boost check off by one|hour_start(h.boost_end_hour)? <= self.last_update|hour_start(h.boost_end_hour)? < self.last_update"
)

survived=0
for m in "${MUTANTS[@]}"; do
  IFS='|' read -r name search replace <<<"$m"
  cp "$BACKUP" "$FILE"
  python3 - "$FILE" "$search" "$replace" <<'PY'
import sys
path, search, replace = sys.argv[1], sys.argv[2].replace('\\n', '\n'), sys.argv[3].replace('\\n', '\n')
src = open(path).read()
assert src.count(search) == 1, f"mutation anchor not found exactly once: {search!r}"
open(path, 'w').write(src.replace(search, replace))
PY
  if cargo test -q -p abyss-haul "${TESTS[@]}" >/dev/null 2>&1; then
    echo "SURVIVED  $name"; survived=$((survived + 1))
  else
    echo "killed    $name"
  fi
done
echo "$survived mutant(s) survived"
exit $survived
