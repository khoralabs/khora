#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEMORIES="$ROOT/../memories"
OUT="$ROOT/src-tauri/binaries"
mkdir -p "$OUT"
cd "$MEMORIES"
TRIPLE="$(rustc --print host-tuple)"
exec bun build --compile src/index.ts --outfile="$OUT/memories-server-${TRIPLE}"
