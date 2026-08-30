# `@khoralabs/khora-registry`

Multi-entrypoint registry package: contracts, accounts/catalog domain, HTTP host, outbound client, and persistence adapters.

## Exports

| Subpath | Purpose |
| --- | --- |
| `.` | Thin composition helpers for `apps/registry` |
| `./contracts` | Wire / DTO types |
| `./persistence` | `RegistryDatabase` port + domain schema (no drivers) |
| `./sqlite` | Bun SQLite adapter |
| `./turso-serverless` | Turso / libsql domain adapter (optional) |
| `./accounts` | Accounts domain |
| `./catalog` | Host catalog domain |
| `./email-confirm` | EmailConfirm API types only |
| `./host` | HTTP host (`createRegistryHost`, `handleRegistryRequest`, identity route factories) |
| `./client` | Host→registry HTTP client |

Persistence layout: [`src/persistence/IMPLEMENTORS.md`](src/persistence/IMPLEMENTORS.md).

Better Auth IdP adapters (bun:sqlite), SES OTP, and `/cli/link` UI live in [`apps/registry/src/services/auth`](../../apps/registry/src/services/auth) and implement package identity ports. Operator APIs are headless at `/v1/ops` (Bearer root token).

## Build & publish

From repo root:

```bash
bun run --cwd packages/client build:schema   # if client schema changed
bun run --cwd packages/registry build
bun test packages/registry
```

Lockstep npm publish with `@khoralabs/khora-client` and `@khoralabs/khora-host`: `.github/workflows/release-khora-libs.yml` → `scripts/stage-khora-libs-release.ts`.
