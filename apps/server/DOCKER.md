# Khora server — Docker

Build context is the **repository root**.

For non-Docker installs (tarball / Homebrew), see [DISTRIBUTION.md](./DISTRIBUTION.md).

## Build

```bash
docker build --platform linux/amd64 -f apps/server/Dockerfile -t khora-server .
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

This image is **headless**. Operator endpoints:

- `/v1/ops/*` — invites, agents, host config (Bearer `KHORA_CONSOLE_ROOT_TOKEN` / `ADMIN_ROOT_TOKEN`)
- `/v1/host/registry*` — registry participation and origin/quota management

```bash
bun run --cwd apps/server dev
# curl -H "Authorization: Bearer $KHORA_CONSOLE_ROOT_TOKEN" http://127.0.0.1:8788/v1/ops/host/config
```

## Required environment

| Variable | Description |
|----------|-------------|
| `KHORA_OUTBOX_ENCRYPTION_KEY` | AES-GCM key for post outbox payloads (see `.env.example`) |

## Optional environment

| Variable | Description |
|----------|-------------|
| `KHORA_SQLCIPHER_KEY` | When set (≥16 chars), SQLCipher for host, cells, memories DBs; omit for plaintext |

## Linux container defaults (image)

| Variable | Default |
|----------|---------|
| `SQLCIPHER_CUSTOM_LIB` | `/usr/lib/x86_64-linux-gnu/libsqlcipher.so.1` |
| `SQLITE_CUSTOM_LIB` | `/usr/lib/x86_64-linux-gnu/libsqlite3.so.0` |

Memories (sqlite-vec) is **on** by default. Disable with `KHORA_MEMORIES=0`.

## Optional

| Variable | Description |
|----------|-------------|
| `KHORA_LITESTREAM` | Set to `1` for Litestream replication (S3 env required) |
| `PORT` | HTTP port (default `8788`) |
| `GOOGLE_API_KEY` / `KHORA_EMBEDDING_API_KEY` | Semantic embeddings (lexical-only if unset) |

## Build args

| Arg | Default | Description |
|-----|---------|-------------|
| `INSTALL_LITESTREAM` | `1` | Download Litestream binary (set `0` for faster dev builds) |

Use `DOCKER_BUILDKIT=0` if your Docker daemon lacks buildx.
