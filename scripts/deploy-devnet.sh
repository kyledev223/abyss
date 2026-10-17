#!/usr/bin/env bash
# Builds the program for devnet (Switchboard devnet program ID) into target/deploy-devnet/, deploys
# it with the local keypair as upgrade authority, then initializes Config if needed.
# The default build in target/deploy/ (mainnet Switchboard ID, used by the tests) is left as is.
#
# Needs ~5 devnet SOL in `solana address` (faucet: https://faucet.solana.com).
set -euo pipefail
cd "$(dirname "$0")/.."

PROGRAM_KEYPAIR=target/deploy/abyss_haul-keypair.json
PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
echo "Program ID:   $PROGRAM_ID"
echo "Deployer:     $(solana address)  ($(solana balance -ud))"

anchor build -- --features devnet
mkdir -p target/deploy-devnet
cp target/deploy/abyss_haul.so target/deploy-devnet/abyss_haul.so
anchor build >/dev/null   # restore the default (mainnet-ID) build for tests

solana program deploy -ud \
  --program-id "$PROGRAM_KEYPAIR" \
  --upgrade-authority "$HOME/.config/solana/id.json" \
  --with-compute-unit-price 10000 \
  target/deploy-devnet/abyss_haul.so

solana program show -ud "$PROGRAM_ID"
(cd client && npm run -s sync-idl && npm run -s devnet:init)
