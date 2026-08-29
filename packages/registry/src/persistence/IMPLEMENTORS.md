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

See [`apps/registry/src/bootstrap-registry.ts`](../../../apps/registry/src/bootstrap-registry.ts): chooses sqlite vs turso from `REGISTRY_BACKEND`, opens domain + auth DBs, runs `initRegistryDomainSchema` + Better Auth migrations, then wires identity/authHttp ports into `createRegistryHost`.
