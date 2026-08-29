# Registry persistence implementor’s guide

Layout mirrors [`memories-node` persistence](https://github.com/khoralabs/memories/tree/main/packages/node/src/persistence): ports live under `core/`; drivers are sibling trees with **flat package exports**.

## Layout

| Path | Role | Public export |
| ---- | ---- | ------------- |
| [`./core`](./core) | `RegistryDatabase` port, shared domain DDL (`initRegistryDomainSchema`) | `@khoralabs/registry/persistence` |
| [`./sqlite`](./sqlite) | Bun `bun:sqlite` (+ SQLCipher) adapter | `@khoralabs/registry/sqlite` |
| [`./turso-serverless`](./turso-serverless) | Turso / libsql adapter + Better Auth Kysely DB | `@khoralabs/registry/turso-serverless` |

## Rules

- Domain / auth / host code imports types and schema helpers from `@khoralabs/registry/persistence` only.
- Composition roots open a store via `@khoralabs/registry/sqlite` or `@khoralabs/registry/turso-serverless` and inject `RegistryDatabase` (+ auth DB) into schema init / Better Auth.
- Driver packages are optional dependencies; importing `./persistence` must not require Turso/libsql.
- Each adapter owns connection + schema application for its driver; shared domain SQL stays in `core/`.

## App wiring

See [`apps/registry/src/bootstrap-registry.ts`](../../../apps/registry/src/bootstrap-registry.ts): chooses sqlite vs turso from `REGISTRY_BACKEND`, then `initRegistrySchema` + `createRegistryHost`.
