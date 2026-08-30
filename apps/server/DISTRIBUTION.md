# Khora server — distribution

Two supported ways to run the headless host:

| Path | Best for | Host deps |
|------|----------|-----------|
| **Platform tarball / Homebrew** | Laptop + VPS self-host | SQLCipher + libsqlite3 (system) |
| **Docker** ([DOCKER.md](./DOCKER.md)) | PaaS / zero host libs | None (image includes libs + Litestream) |

Operator management is headless (`/v1/ops`, `/v1/host/registry` with Bearer root token). No separate admin UI process.

## Platform package (`khora-server`)

### Layout

```
bin/khora-server
bin/litestream
lib/vec0.{dylib,so}
README.md
```

### Install (curl)

```bash
# Example — pick the asset matching your OS/arch from the public release
VERSION=0.1.0
SLUG=darwin-arm64   # or linux-x64 / linux-arm64
curl -fsSL "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v${VERSION}/khora-server-${SLUG}.tar.gz" \
  | tar -xz -C /usr/local
```

Or use the helper (hosted on the public tap):

```bash
curl -fsSL https://raw.githubusercontent.com/khoralabs/homebrew-tap/main/scripts/install-khora-server.sh | bash
```

Release assets are published to [`khoralabs/homebrew-tap`](https://github.com/khoralabs/homebrew-tap/releases) (the source repo is private).

### Install (Homebrew)

```bash
brew tap khoralabs/tap
brew install khora-server
```

Formula depends on `sqlcipher` and `sqlite`. Bundled Litestream is installed as `khora-litestream` (avoids clashing with the upstream Litestream formula).

### Run

```bash
# macOS
brew install sqlcipher sqlite

# Debian/Ubuntu
# sudo apt-get install -y libsqlcipher1 libsqlite3-0

export KHORA_OUTBOX_ENCRYPTION_KEY='64-char-hex-or-32+-byte-string'
# Optional: SQLCipher for at-rest SQLite (omit for plaintext local DBs)
# export KHORA_SQLCIPHER_KEY='your-key-at-least-16-chars'
export KHORA_DATA_DIR=./data

# Host memories live under {KHORA_DATA_DIR}/memories (service layout).
# If you still have a bare khora-memories.sqlite from an older build, move it into
# that layout before upgrading (the one-shot migrate was removed).

khora-server
# default PORT=8788
```

Packaged binaries:

- Default `KHORA_COLONNADE_CELL_WORKERS=0` (Bun cell Workers are fragile under `--compile`).
- Probe common SQLCipher / libsqlite3 paths into `SQLCIPHER_CUSTOM_LIB` / `SQLITE_CUSTOM_LIB` when unset.
- Set `SQLITE_VEC_PATH` to the bundled `lib/vec0.*` when unset.
- Set `LITESTREAM_BIN_PATH` to the bundled `bin/litestream` when unset.

### Litestream (opt-in)

Same as Docker / monorepo:

```bash
export KHORA_LITESTREAM=1
export LITESTREAM_S3_BUCKET=...
export LITESTREAM_S3_KEY_PREFIX=hosts/my-host/litestream
# LITESTREAM_S3_ENDPOINT=... for MinIO; see .env.example
khora-server
```

### Build from source (monorepo)

```bash
bun install
bun run apps/server/scripts/build.ts bun-darwin-arm64   # or linux-*
bun run scripts/release/server/stage.ts 0.0.0-dev
bun run scripts/release/package-tarballs.ts server 0.0.0-dev
bun run scripts/release/verify-binaries.ts server
```

Release CI: `.github/workflows/release-khora-server.yml` (tarballs + GHCR slim Docker + Homebrew).

## Docker

See [DOCKER.md](./DOCKER.md). Prefer Docker when you do not want to install SQLCipher on the host.
