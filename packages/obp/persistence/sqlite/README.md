# `@cfd/obp-sqlite`

Native **SQLite** implementation of [`ObpPersistence`](../../obp-core/src/persistence-types.ts) from [`@cfd/obp-core`](../../obp-core) using [`bun:sqlite`](https://bun.sh/docs/api/sqlite). No dependency on memories; optional `sourcemaps` on entities are stored as JSON.

## Usage

```ts
import { Database } from "bun:sqlite";
import { ObpClient } from "@cfd/obp-core";
import { createObpSqlitePersistence, initObpSchema, openObpDatabase } from "@cfd/obp-sqlite";

const db = new Database(":memory:");
initObpSchema(db);
const persistence = createObpSqlitePersistence(db, { now: () => Date.now() });
const client = new ObpClient(persistence);

// Or open a file-backed DB:
// const db = openObpDatabase("./obp.sqlite");
```

## API

| Export | Purpose |
|--------|---------|
| `initObpSchema(db)` | Idempotent `CREATE TABLE` / indexes; enables `foreign_keys` and `WAL`. |
| `openObpDatabase(path)` | `new Database(path, { create: true })` + `initObpSchema`. |
| `createObpSqlitePersistence(db, options?)` | Returns an [`ObpPersistence`](../../obp-core/src/persistence-types.ts). Optional `now` for tests. |
| `ObpSqlitePersistence` | Concrete class (usually used via the factory). |
| `OBP_SCHEMA_SQL` | Raw DDL string for advanced setups. |

## Contracts

- Mutations run in **`db.transaction`** and enforce the same invariants as [`ObpClient`](../../obp-core/src/client.ts) (via `@cfd/obp-core` helpers). Direct use of `ObpPersistence` without `ObpClient` is still safe for basic integrity.
- Wire shapes follow [`packages/obp/spec`](../../spec).

## Verification

```bash
bun test
bunx tsc -p packages/obp-persistence/sqlite --noEmit
```
