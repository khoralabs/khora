#!/bin/sh
# sql-studio entrypoint.
#
# If $LITESTREAM_CONFIG is set and the local DB file is missing, pull a fresh
# copy from the configured S3 replica before serving. Otherwise just open
# whatever happens to be at $DB_PATH (e.g. a manually-mounted SQLite file).
#
# Refresh strategy: redeploy (or `docker compose up --force-recreate sql-studio`)
# wipes the working copy and re-restores at boot. We intentionally do not
# live-tail with Litestream replicate because sql-studio holds an open fd on
# the file and would serve stale reads after a swap.
set -eu

mkdir -p "$(dirname "$DB_PATH")"

if [ -n "${LITESTREAM_CONFIG:-}" ] && [ ! -f "$DB_PATH" ]; then
  litestream restore \
    -if-replica-exists \
    -config "$LITESTREAM_CONFIG" \
    "$DB_PATH"
fi

exec sql-studio \
  --no-browser \
  --no-shutdown \
  --address "0.0.0.0:${PORT}" \
  sqlite "$DB_PATH"
