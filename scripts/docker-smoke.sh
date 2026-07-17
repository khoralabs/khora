#!/usr/bin/env bash
# Build and smoke-test Khora registry + server images (linux/amd64).
# Requires a working Docker daemon (Docker Desktop, Colima, etc.).
#
# Usage (from repo root):
#   ./scripts/docker-smoke.sh              # build + smoke
#   SKIP_BUILD=1 ./scripts/docker-smoke.sh # smoke only (images already built)
#   BUILD_ONLY=1 ./scripts/docker-smoke.sh # build only
#
# Faster local builds (skip Litestream download; not needed for /health smoke):
#   INSTALL_LITESTREAM=0 ./scripts/docker-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
REGISTRY_IMAGE="${REGISTRY_IMAGE:-khora-registry:local}"
SERVER_IMAGE="${SERVER_IMAGE:-khora-server:local}"
INSTALL_LITESTREAM="${INSTALL_LITESTREAM:-0}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-90}"
CURL_OPTS=(--max-time 3 -sf)

REGISTRY_SQLCIPHER_KEY="${REGISTRY_SQLCIPHER_KEY:-test-registry-sqlcipher-key!}"
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-dev-only-insecure-secret-replace-me-32chars}"
KHORA_SQLCIPHER_KEY="${KHORA_SQLCIPHER_KEY:-test-khora-sqlcipher-key!!}"
KHORA_OUTBOX_ENCRYPTION_KEY="${KHORA_OUTBOX_ENCRYPTION_KEY:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"

docker_build() {
  local dockerfile=$1 tag=$2
  echo "==> docker build $tag ($PLATFORM, INSTALL_LITESTREAM=$INSTALL_LITESTREAM)"
  DOCKER_BUILDKIT=0 docker build \
    --platform "$PLATFORM" \
    --build-arg "INSTALL_LITESTREAM=$INSTALL_LITESTREAM" \
    -f "$dockerfile" \
    -t "$tag" \
    .
}

wait_for_health() {
  local url=$1 name=$2
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SEC))
  while ((SECONDS < deadline)); do
    if curl "${CURL_OPTS[@]}" "$url" >/dev/null 2>&1; then
      echo "$name OK ($url)"
      curl "${CURL_OPTS[@]}" "$url" | head -c 200
      echo
      return 0
    fi
    sleep 2
  done
  echo "$name failed within ${HEALTH_TIMEOUT_SEC}s; last logs:" >&2
  docker logs "$name" 2>&1 | tail -30 >&2
  return 1
}

echo "==> Docker daemon"
if ! docker info >/dev/null 2>&1; then
  echo "Docker not reachable. Start your Docker daemon and retry." >&2
  exit 1
fi

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  docker_build apps/khora/registry/Dockerfile "$REGISTRY_IMAGE"
  docker_build apps/khora/server/Dockerfile "$SERVER_IMAGE"
fi

if [[ "${BUILD_ONLY:-}" == "1" ]]; then
  echo "==> BUILD_ONLY set; skipping container smoke"
  exit 0
fi

cleanup() {
  docker rm -f khora-registry-test khora-server-test 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Registry smoke"
docker run --rm -d --name khora-registry-test -p 4000:4000 \
  -e NODE_ENV=production \
  -e REGISTRY_SQLCIPHER_KEY="$REGISTRY_SQLCIPHER_KEY" \
  -e BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
  -e REGISTRY_URL=http://127.0.0.1:4000 \
  -e REGISTRY_DATABASE_PATH=/data/registry.sqlite \
  -e REGISTRY_AUTH_OTP_LOG=1 \
  "$REGISTRY_IMAGE"

wait_for_health "http://127.0.0.1:4000/health" khora-registry-test
docker stop khora-registry-test >/dev/null

echo "==> Server smoke (Memories on)"
docker run --rm -d --name khora-server-test -p 8788:8788 \
  -e NODE_ENV=production \
  -e KHORA_SQLCIPHER_KEY="$KHORA_SQLCIPHER_KEY" \
  -e KHORA_OUTBOX_ENCRYPTION_KEY="$KHORA_OUTBOX_ENCRYPTION_KEY" \
  -e KHORA_DATA_DIR=/data \
  "$SERVER_IMAGE"

wait_for_health "http://127.0.0.1:8788/health" khora-server-test

if docker logs khora-server-test 2>&1 | grep -iE 'dynamic extension loading|SQLCipher key application failed'; then
  echo "server logs contain SQLite/Memories errors" >&2
  docker logs khora-server-test 2>&1 | tail -30 >&2
  exit 1
fi

docker stop khora-server-test >/dev/null

echo "==> All smoke checks passed"
