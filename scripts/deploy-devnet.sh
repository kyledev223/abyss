#!/usr/bin/env bash
# Deploys the program to devnet and initializes it. Uses this project's own devnet wallet
# (keys/deployer-devnet.json, gitignored) as fee payer, upgrade authority and devnet admin, and the
# Helius RPC from web/.env.local (HELIUS_API_KEY; the key is never printed). ORAO VRF has one
# program ID on devnet and mainnet, so this is the same build as mainnet.
#
# Needs ~6.5 devnet SOL in the deployer: ~3.1 locked as program rent, plus ~3.1 held in a temporary
# upload buffer that is refunded when the deploy finishes. Faucet: https://faucet.solana.com
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOYER=keys/deployer-devnet.json
KEEPER=keys/keeper-devnet.json
PROGRAM_KEYPAIR=target/deploy/abyss_haul-keypair.json
SITE_URL=${SITE_URL:-https://abyss-snowy.vercel.app}

KEY=$(grep -E '^HELIUS_API_KEY=' web/.env.local | cut -d= -f2- | tr -d '"')
[ -n "$KEY" ] || { echo "HELIUS_API_KEY missing from web/.env.local" >&2; exit 1; }
RPC="https://devnet.helius-rpc.com/?api-key=$KEY"

PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
echo "Program ID:  $PROGRAM_ID"
echo "Deployer:    $(solana-keygen pubkey "$DEPLOYER")  ($(solana balance -u "$RPC" -k "$DEPLOYER"))"

anchor build
solana program deploy -u "$RPC" \
  -k "$DEPLOYER" \
  --program-id "$PROGRAM_KEYPAIR" \
  --upgrade-authority "$DEPLOYER" \
  --with-compute-unit-price 10000 \
  --use-rpc \
  target/deploy/abyss_haul.so
solana program show -u "$RPC" "$PROGRAM_ID"

# Keeper hot wallet: a little SOL for transaction fees, nothing else.
KEEPER_ADDR=$(solana-keygen pubkey "$KEEPER")
solana transfer -u "$RPC" -k "$DEPLOYER" --allow-unfunded-recipient "$KEEPER_ADDR" 0.05 >/dev/null
echo "Keeper:      $KEEPER_ADDR funded with 0.05 SOL"

(
  cd client
  npm run -s sync-idl
  DEVNET_RPC_URL="$RPC" DEPLOYER_KEYPAIR="../$DEPLOYER" \
    URI_BASE="$SITE_URL/api/meta/" COLLECTION_URI="$SITE_URL/api/collection" \
    npm run -s devnet:init
)
echo "Deployer left: $(solana balance -u "$RPC" -k "$DEPLOYER")"
