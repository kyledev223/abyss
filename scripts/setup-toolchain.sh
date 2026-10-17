#!/usr/bin/env bash
# Installs the Abyss Haul toolchain for the current (non-root) user in WSL2 Ubuntu.
# System packages first (run once, as root):
#   apt-get install -y build-essential pkg-config libssl-dev libudev-dev llvm libclang-dev protobuf-compiler curl git
set -euo pipefail

# Rust
if ! command -v rustup >/dev/null 2>&1 && [ ! -x "$HOME/.cargo/bin/rustup" ]; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
. "$HOME/.cargo/env"

# Solana CLI (Anza)
SOLANA_BIN="$HOME/.local/share/solana/install/active_release/bin"
if [ ! -x "$SOLANA_BIN/solana" ]; then
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
fi
export PATH="$SOLANA_BIN:$PATH"

# Anchor via avm
if ! command -v avm >/dev/null 2>&1; then
  cargo install --git https://github.com/solana-foundation/anchor avm --locked --force
fi
avm install latest
avm use latest

# Node (LTS) via nvm
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -so- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
. "$NVM_DIR/nvm.sh"
nvm install --lts >/dev/null
nvm alias default 'lts/*' >/dev/null

echo "---- versions ----"
rustc --version
cargo --version
solana --version
anchor --version
avm --version
node --version
npm --version
