#!/bin/bash
set -euo pipefail

echo '{"async": true, "asyncTimeout": 300000}'

# Web env only; local machines manage their own setup.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Node deps (wrangler).
npm install

# Reuse the repo's self-installing build (toolchain + WASM). Tolerate a blocked
# wasm-opt download so cargo test still works.
npm run build || echo "session-start: WASM build did not finish; Rust toolchain installed, cargo test works."
