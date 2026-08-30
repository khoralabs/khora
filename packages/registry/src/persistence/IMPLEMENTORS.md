# Registry persistence implementor’s guide

Layout mirrors [`memories-node` persistence](https://github.com/khoralabs/memories/tree/main/packages/node/src/persistence): ports live under `core/`; drivers are sibling trees with **flat package exports**.

## Layout

| Path | Role | Public export |
| ---- | ---- | ------------- |
| [`./core`](./core) | `RegistryDatabase` port, shared domain DDL (`initRegistryDomainSchema`) | `@khoralabs/registry/persistence` |
| [`./sqlite`](./sqlite) | Bun `bun:sqlite` (+ SQLCipher) adapter | `@khoralabs/registry/sqlite` |
| [`./turso-serverless`](./turso-serverless) | Turso / `@tursodatabase/serverless` domain adapter | `@khoralabs/registry/turso-serverless` |

## Rules

- Domain / host code imports types and schema helpers from `@khoralabs/registry/persistence` only.
- Composition roots open a domain store via `@khoralabs/registry/sqlite` or `@khoralabs/registry/turso-serverless` and inject `RegistryDatabase` into the host. Better Auth (and its auth DB) live in `apps/registry`.
- Driver packages are optional dependencies; importing `./persistence` must not require Turso.
- Each adapter owns connection + schema application for its driver; shared domain SQL stays in `core/`.

## App wiring

See [`apps/registry/src/bootstrap-registry.ts`](../../../apps/registry/src/bootstrap-registry.ts): opens the Bun SQLite domain + auth store, runs `initRegistryDomainSchema` + Better Auth migrations (via `apps/registry/src/services/auth`), then wires identity/authHttp ports into `createRegistryHost`. The reference app is sqlite-only; other composition roots may still use `./turso-serverless` for the domain DB.
