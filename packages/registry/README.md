# `@khoralabs/registry`

Multi-entrypoint registry package: contracts, accounts/catalog domain, Better Auth, HTTP host, outbound client, and memories-style persistence adapters.

## Exports

| Subpath | Purpose |
| --- | --- |
| `.` | Thin composition helpers for `apps/registry` |
| `./contracts` | Wire / DTO types |
| `./persistence` | `RegistryDatabase` port + domain schema (no drivers) |
| `./sqlite` | Bun SQLite adapter |
| `./turso-serverless` | Turso / libsql adapter |
| `./accounts` | Accounts domain |
| `./catalog` | Host catalog domain |
| `./auth`, `./auth/client`, `./auth/ses` | Better Auth IdP |
| `./host` | HTTP host (`createRegistryHost`) |
| `./client` | Host→registry HTTP client |

Persistence layout: [`src/persistence/IMPLEMENTORS.md`](src/persistence/IMPLEMENTORS.md).

React admin / EmailConfirm UI lives in [`apps/registry`](../../apps/registry), not this package.
