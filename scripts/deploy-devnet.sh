#!/usr/bin/env bash
# Builds and deploys the program to devnet with the local keypair as upgrade authority, then
# initializes Config if needed. ORAO VRF uses the same program ID on devnet and mainnet, so the
# devnet build is the same as the mainnet build.
#
# Needs ~5 devnet SOL in `solana address` (faucet: https://faucet.solana.com).
set -euo pipefail
cd "$(dirname "$0")/.."

PROGRAM_KEYPAIR=target/deploy/abyss_haul-keypair.json
PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
echo "Program ID:   $PROGRAM_ID"
echo "Deployer:     $(solana address)  ($(solana balance -ud))"

anchor build
solana program deploy -ud \
  --program-id "$PROGRAM_KEYPAIR" \
  --upgrade-authority "$HOME/.config/solana/id.json" \
  --with-compute-unit-price 10000 \
  target/deploy/abyss_haul.so

solana program show -ud "$PROGRAM_ID"
(cd client && npm run -s sync-idl && npm run -s devnet:init)
