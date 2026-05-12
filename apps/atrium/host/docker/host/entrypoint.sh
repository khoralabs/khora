#!/bin/sh
# Atrium host + Litestream supervisor entrypoint.
#
# 1. Ensure the data dir exists.
# 2. Idempotent disaster-recovery restore. `-if-replica-exists` makes this a
#    no-op when the S3 prefix is empty (first deploy). `-if-db-not-exists`
#    skips when the local disk already has a copy (normal restart).
# 3. `litestream replicate -exec` becomes PID 1 and supervises `atrium-host`,
#    forwarding SIGTERM and performing a final WAL sync on shutdown.
set -eu

mkdir -p "$(dirname "$ATRIUM_DB_PATH")"

litestream restore \
  -if-replica-exists \
  -if-db-not-exists \
  -config "$LITESTREAM_CONFIG" \
  "$ATRIUM_DB_PATH" || true

exec litestream replicate \
  -exec "atrium-host" \
  -config "$LITESTREAM_CONFIG"
