# Khora registry — Docker (compiled binary)

Build context is the **repository root**. Images ship the same `khora-registry` binary as Homebrew/tarballs (plus Litestream).

Published images: `ghcr.io/khoralabs/khora-registry:<version>` (from the release workflow).

## Build locally

```bash
bun run apps/registry/scripts/build.ts bun-linux-x64
bun run scripts/stage-khora-registry-release.ts 0.0.0-local
docker build -f apps/registry/Dockerfile --build-arg RELEASE_SLUG=linux-x64 -t khora-registry .
# arm64: bun-linux-arm64 + RELEASE_SLUG=linux-arm64
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
| `REGISTRY_LITESTREAM` | `1` to run Litestream sidecar (needs S3 env; see `.env.example`) |
| `REGISTRY_AUTH_OTP_LOG` | Log OTP codes instead of SES (dev) |
| `SQLCIPHER_CUSTOM_LIB` | Override SQLCipher `.so` path |

## Build args

| Arg | Default | Description |
|-----|---------|-------------|
| `RELEASE_SLUG` | `linux-x64` | Staged package under `apps/release/registry-<slug>/` |

SQLCipher paths are probed at runtime for amd64 and arm64; do not hardcode
`SQLCIPHER_CUSTOM_LIB` in the image.
