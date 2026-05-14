#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for pkg in model persistence nbc frames session transport-http2; do
  echo "==> obp-v2: $pkg"
  (cd "$ROOT/$pkg/spec" && smithy validate model && smithy build)
done
echo "==> obp-v2: all packages OK"
