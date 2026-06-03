# Khora registry — Docker

Build context is the **repository root**.

## Build

```bash
docker build --platform linux/amd64 -f apps/khora/registry/Dockerfile -t khora-registry .
```

## Run

```bash
docker run --rm -p 4000:4000 \
  -e REGISTRY_SQLCIPHER_KEY='your-key-at-least-16-chars' \
  -e BETTER_AUTH_SECRET='your-secret-at-least-32-chars' \
  -e REGISTRY_URL=http://localhost:4000 \
  -e REGISTRY_DATABASE_PATH=/data/registry.sqlite \
  -v khora-registry-data:/data \
  khora-registry
```

## Required environment

| Variable | Description |
|----------|-------------|
| `REGISTRY_SQLCIPHER_KEY` | SQLCipher key for `registry.sqlite` (≥16 chars) |
| `BETTER_AUTH_SECRET` | Better Auth secret (≥32 chars recommended) |
| `REGISTRY_URL` | Public URL for auth links and CORS |

## Optional

| Variable | Description |
|----------|-------------|
| `REGISTRY_LITESTREAM` | Set to `1` to run Litestream sidecar (needs S3 env; see `.env.example`) |
| `REGISTRY_AUTH_OTP_LOG` | Log OTP codes instead of SES (dev) |
| `SQLCIPHER_CUSTOM_LIB` | Override SQLCipher `.so` path (set in image for Debian amd64) |

## Build args

| Arg | Default | Description |
|-----|---------|-------------|
| `INSTALL_LITESTREAM` | `1` | Download Litestream binary into `.bin/` (set `0` for faster dev builds) |

Use `DOCKER_BUILDKIT=0` if Colima lacks buildx.

## Local smoke test (Colima)

```bash
colima start --cpu 4 --memory 8
./scripts/docker-smoke-colima.sh          # INSTALL_LITESTREAM=0 by default in script
SKIP_BUILD=1 ./scripts/docker-smoke-colima.sh   # re-run health checks only
```
