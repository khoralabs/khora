# @khoralabs/registry-turso-serverless

Turso serverless persistence for the Khora registry (single catalog database).

## Usage

```ts
import { openRegistryTursoDatabase } from "@khoralabs/registry-turso-serverless";
import { initRegistrySchema } from "@khoralabs/registry-auth";

const bundle = await openRegistryTursoDatabase({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
await initRegistrySchema(bundle.registry, bundle.authDatabase);
// bundle.registry — domain queries (hosts, accounts, links)
// bundle.authDatabase — Better Auth Kysely/libsql adapter
```

## Env vars

| Variable | Purpose |
|----------|---------|
| `REGISTRY_BACKEND=turso` | Select Turso in app bootstrap |
| `TURSO_DATABASE_URL` / `REGISTRY_TURSO_URL` | libsql URL |
| `TURSO_AUTH_TOKEN` / `REGISTRY_TURSO_AUTH_TOKEN` | Auth token |

Better Auth uses `@libsql/client` + Kysely (`LibsqlDialect`) against the same Turso database. Domain code uses `@tursodatabase/serverless` via `RegistryDatabase`.

## Tests

```sh
bun test
```

Live Turso integration tests run when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set.
