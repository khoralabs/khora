#!/bin/sh
# Self-configuring MinIO entrypoint.
#
# Boot order:
#   1. Validate required creds (fail fast if missing).
#   2. Launch `minio server` in the background under our control so we can
#      forward signals and finalize on SIGTERM.
#   3. Poll the readiness endpoint via `mc alias set` until it succeeds.
#   4. Idempotently `mc mb` each bucket in $MINIO_BUCKETS (comma-separated).
#   5. `wait` so the container's lifetime tracks the server process.
#
# On SIGTERM/SIGINT we forward to MinIO and `wait` for a clean shutdown,
# which matters because Render sends SIGTERM and we want a flushed close.
set -eu

if [ -z "${MINIO_ROOT_USER:-}" ] || [ -z "${MINIO_ROOT_PASSWORD:-}" ]; then
  echo "minio-init: MINIO_ROOT_USER and MINIO_ROOT_PASSWORD must be set" >&2
  exit 1
fi

mkdir -p /data

# Start the server in the background so we can run mc against it.
minio server /data --console-address ":9001" &
MINIO_PID=$!

shutdown() {
  echo "minio-init: forwarding $1 to minio (pid=$MINIO_PID)"
  kill -TERM "$MINIO_PID" 2>/dev/null || true
  wait "$MINIO_PID"
  exit 0
}
trap 'shutdown TERM' TERM
trap 'shutdown INT' INT

# Wait for the API to come up. `mc alias set` against an unreachable server
# returns non-zero, so we use it as the readiness probe.
RETRY_MAX="${MINIO_HEALTH_RETRY_MAX:-60}"
i=0
while [ "$i" -lt "$RETRY_MAX" ]; do
  if mc alias set local "http://127.0.0.1:9000" \
       "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$i" -ge "$RETRY_MAX" ]; then
  echo "minio-init: server did not become ready within ${RETRY_MAX}s" >&2
  kill -TERM "$MINIO_PID" 2>/dev/null || true
  wait "$MINIO_PID" || true
  exit 1
fi

# Idempotent bucket creation. $MINIO_BUCKETS is comma-separated (e.g. "atr1,atr2").
# Each entry becomes a top-level MinIO bucket — the convention is one bucket per
# atrium-host hostname so litestream replicas don't collide.
if [ -n "${MINIO_BUCKETS:-}" ]; then
  OLD_IFS=$IFS
  IFS=','
  for bucket in $MINIO_BUCKETS; do
    # POSIX trim of leading/trailing whitespace.
    bucket=$(printf "%s" "$bucket" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    [ -z "$bucket" ] && continue
    if mc mb --ignore-existing "local/$bucket" >/dev/null 2>&1; then
      echo "minio-init: ensured bucket: $bucket"
    else
      echo "minio-init: WARNING failed to create bucket: $bucket" >&2
    fi
  done
  IFS=$OLD_IFS
else
  echo "minio-init: MINIO_BUCKETS unset; skipping bucket bootstrap"
fi

echo "minio-init: ready"
wait "$MINIO_PID"
