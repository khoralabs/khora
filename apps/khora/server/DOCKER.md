# Khora server — Docker

Build context is the **repository root**.

For non-Docker installs (tarball / Homebrew), see [DISTRIBUTION.md](./DISTRIBUTION.md).

## Build

```bash
docker build --platform linux/amd64 -f apps/khora/server/Dockerfile -t khora-server .
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

## Admin console (separate app)

The React admin UI lives in `apps/khora/admin` (`@khoralabs/khora-admin`). This image is **headless**: `/admin/api/*` only.

Local dual-process:

```bash
# terminal A — headless API
bun run --cwd apps/khora/server dev

# terminal B — console (proxies /admin/api → host)
KHORA_HOST_ORIGIN=http://127.0.0.1:8788 bun run --cwd apps/khora/admin dev
# open http://127.0.0.1:8789/admin
```

Docker: run a second container/process for `@khoralabs/khora-admin` with `KHORA_HOST_ORIGIN` pointing at the internal server (e.g. `http://khora-server:8788`) and expose the admin port for operators.

## Required environment

| Variable | Description |
|----------|-------------|
| `KHORA_SQLCIPHER_KEY` | SQLCipher key for catalog, cells, memories DBs |
| `KHORA_OUTBOX_ENCRYPTION_KEY` | AES-GCM key for post outbox payloads (see `.env.example`) |

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

## Local smoke test

Requires a running Docker daemon. From the repo root:

```bash
./scripts/docker-smoke.sh
SKIP_BUILD=1 ./scripts/docker-smoke.sh
```
