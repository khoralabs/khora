#!/bin/sh
set -eu

# MinIO starts in the background; we create S3 bucket(s) with mc, then wait on the server.
# Override buckets: set LITESTREAM_S3_BUCKET (single, same name as Atrium) or LITESTREAM_BUCKETS (comma-separated).

MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"

if [ -n "${LITESTREAM_S3_BUCKET:-}" ]; then
  bucket_list="$LITESTREAM_S3_BUCKET"
else
  bucket_list="${LITESTREAM_BUCKETS:-atrium-backups}"
fi

_forward_term() {
  if [ -n "${minio_pid:-}" ]; then
    kill -TERM "$minio_pid" 2>/dev/null || true
  fi
}
trap _forward_term TERM INT

/usr/bin/minio "$@" &
minio_pid=$!

_ready=0
_i=0
while [ "$_i" -lt 90 ]; do
  if mc alias set bootstrap "http://127.0.0.1:9000" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
    if mc admin info bootstrap >/dev/null 2>&1; then
      _ready=1
      break
    fi
  fi
  _i=$((_i + 1))
  sleep 1
done

if [ "$_ready" -ne 1 ]; then
  echo "entrypoint: MinIO API did not become ready in time" >&2
  kill "$minio_pid" 2>/dev/null || true
  exit 1
fi

old_ifs=$IFS
IFS=,
for b in $bucket_list; do
  # trim leading/trailing whitespace (MinIO image has no sed—pure POSIX sh)
  b="${b#"${b%%[![:space:]]*}"}"
  b="${b%"${b##*[![:space:]]}"}"
  [ -z "$b" ] && continue
  if ! mc mb -p "bootstrap/$b" >/dev/null 2>&1; then
    if ! mc ls "bootstrap/$b" >/dev/null 2>&1; then
      echo "entrypoint: failed to create or verify bucket '$b'" >&2
      kill "$minio_pid" 2>/dev/null || true
      exit 1
    fi
  fi
done
IFS=$old_ifs

wait "$minio_pid"
