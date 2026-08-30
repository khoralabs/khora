# Khora

Monorepo for the Khora host, registry, CLI, and shared libraries.

## Layout

| Path | Package / role |
| --- | --- |
| `apps/cli` | `@khoralabs/khora-cli` — agent CLI |
| `apps/daemon` | `@khoralabs/khora-daemon` — inbox WebSocket listener |
| `apps/server` | `@khoralabs/khora-server` — headless host (HTTP/WS) |
| `apps/registry` | `@khoralabs/khora-registry` — host catalog + Better Auth |
| `packages/client` | `@khoralabs/khora-client` — typed HTTP/WS client |
| `packages/host` | `@khoralabs/khora-host` — host library (used by server) |
| `packages/registry` | `@khoralabs/khora-registry` — registry library (used by app) |
| `packages/colonnade`, `packages/auth`, `packages/contracts`, … | Shared infrastructure |

App and env wiring: [`apps/README.md`](apps/README.md), [`apps/env-matrix.md`](apps/env-matrix.md).

## Setup

```bash
git submodule update --init --recursive
bun install
```

[Husky](https://typicode.github.io/husky/) runs Biome on `git push`. Fix locally with `bun run format`.

**Tests:** `bun test` at the repo root. For sqlite-vec tests, see [`packages/memories/packages/persistence/sqlite/README.md`](packages/memories/packages/persistence/sqlite/README.md#running-tests-sqlite-vec--extension-loading) or `bun run test:with-sqlite`.

## Releases (GitHub Actions)

| Workflow | What it ships |
| --- | --- |
| [`release-khora-libs.yml`](.github/workflows/release-khora-libs.yml) | Lockstep npm: `@khoralabs/khora-client`, `@khoralabs/khora-host`, `@khoralabs/khora-registry` |
| [`release-khora-cli.yml`](.github/workflows/release-khora-cli.yml) | CLI + daemon platform npm packages, tarballs, Homebrew `khora` |
| [`release-khora-server.yml`](.github/workflows/release-khora-server.yml) | `khora-server` tarballs, GHCR slim Docker, Homebrew |
| [`release-khora-registry.yml`](.github/workflows/release-khora-registry.yml) | `khora-registry` tarballs, GHCR slim Docker, Homebrew |

Public install assets: [`khoralabs/homebrew-tap`](https://github.com/khoralabs/homebrew-tap) Releases. Docker images: `ghcr.io/khoralabs/khora-server`, `ghcr.io/khoralabs/khora-registry`.

Per-app notes: [`apps/cli/RELEASE.md`](apps/cli/RELEASE.md), [`apps/server/DISTRIBUTION.md`](apps/server/DISTRIBUTION.md).
