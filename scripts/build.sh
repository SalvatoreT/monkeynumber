#!/usr/bin/env sh
# Build the Rust seed-search to WASM (public/pkg/).
#
# This is self-contained so `npm run build` works in CI that ships Node but not
# Rust — notably Cloudflare Workers Builds. Everything is guarded by a presence
# check, so locally (where the toolchain already exists) it's a fast no-op apart
# from the actual compile.
set -e

# 1. Rust toolchain (rustup installs cargo into ~/.cargo).
if ! command -v cargo >/dev/null 2>&1; then
  echo "==> Installing Rust toolchain…"
  curl https://sh.rustup.rs -sSf | sh -s -- -y
fi
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

# 2. WASM target.
rustup target add wasm32-unknown-unknown

# 3. wasm-pack (compiled from source; only when missing).
if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "==> Installing wasm-pack…"
  cargo install -q wasm-pack
fi

# 4. Build.
wasm-pack build --target web --out-dir public/pkg --release
