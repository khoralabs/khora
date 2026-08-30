# Khora server — Docker (compiled binary)

Build context is the **repository root**. Images ship the same `khora-server` binary as Homebrew/tarballs (plus Litestream and sqlite-vec).

For non-Docker installs, see [DISTRIBUTION.md](./DISTRIBUTION.md).

Published images: `ghcr.io/khoralabs/khora-server:<version>` (from the release workflow).

## Build locally

```bash
bun run apps/server/scripts/build.ts bun-linux-x64
bun run scripts/stage-khora-server-release.ts 0.0.0-local
docker build -f apps/server/Dockerfile --build-arg RELEASE_SLUG=linux-x64 -t khora-server .
# arm64: bun-linux-arm64 + RELEASE_SLUG=linux-arm64
```

## Run

```bash
docker run --rm -p 8788:8788 \
  -e KHORA_SQLCIPHER_KEY='your-key-at-least-16-chars' \
  -e KHORA_OUTBOX_ENCRYPTION_KEY='64-char-hex-or-32+-byte-string' \
  -e KHORA_DATA_DIR=/data \
  -v khora-server-data:/data \
  khora-server
```

## Operator API (headless)

- `/v1/ops/*` — invites, agents, host config (Bearer operator / root token)
- `/v1/host/registry*` — registry participation and origin/quota management

## Required environment

| Variable | Description |
|----------|-------------|
| `KHORA_OUTBOX_ENCRYPTION_KEY` | AES-GCM key for post outbox payloads (see `.env.example`) |

## Optional environment

| Variable | Description |
|----------|-------------|
| `KHORA_SQLCIPHER_KEY` | When set (≥16 chars), SQLCipher for host, cells, memories DBs |
| `KHORA_LITESTREAM` | `1` for Litestream replication (S3 env required) |
| `PORT` | HTTP port (default `8788`) |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` / `KHORA_EMBEDDING_API_KEY` | Semantic embeddings |

## Build args

| Arg | Default | Description |
|-----|---------|-------------|
| `RELEASE_SLUG` | `linux-x64` | Staged package under `apps/release/server-<slug>/` |

SQLCipher / libsqlite3 paths are probed at runtime for amd64 and arm64; do not hardcode
`SQLCIPHER_CUSTOM_LIB` / `SQLITE_CUSTOM_LIB` in the image.
