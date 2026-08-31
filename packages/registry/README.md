# `@khoralabs/khora-registry`

Multi-entrypoint registry package: contracts, accounts/catalog domain, HTTP host, outbound client, and persistence adapters.

## Exports

| Subpath | Purpose |
| --- | --- |
| `.` | Thin composition helpers for `apps/registry` (`composeRegistryHost`, …) |
| `./contracts` | Wire / DTO types |
| `./persistence` | `RegistryDatabase` port + domain schema (no drivers) |
| `./sqlite` | Bun SQLite adapter |
| `./turso-serverless` | Turso / libsql domain adapter (optional) |
| `./accounts` | Accounts domain |
| `./catalog` | Host catalog domain |
| `./email-confirm` | EmailConfirm API types only |
| `./host` | HTTP host (`composeRegistryHost`, `handleRegistryRequest`, identity route factories) |
| `./client` | Host→registry HTTP client |

Persistence layout: [`src/persistence/IMPLEMENTORS.md`](src/persistence/IMPLEMENTORS.md).

**Composition:** after opening a domain DB and building IdP ports, call `composeRegistryHost({ db, identity, authHttp, adminTokenAuth, … })` then serve with `handleRegistryRequest` (optional `peerIp` / `onReady`). Bun.serve, OTel, packaged runtime, Better Auth/SES, and `/cli/link` UI stay in [`apps/registry`](../../apps/registry). Operator APIs are headless at `/v1/ops` (Bearer root token).

## Build & publish

From repo root:

```bash
bun run --cwd packages/client build:schema   # if client schema changed
bun run --cwd packages/registry build
bun test packages/registry
```

Lockstep npm publish with `@khoralabs/khora-client` and `@khoralabs/khora-host`: `.github/workflows/release-khora-libs.yml` → `scripts/release/libs/stage.ts`.
