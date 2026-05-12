# @khoralabs/sqlite-migrate

Sequential, transactional SQLite migration runner for `bun:sqlite`.

- A `Migration` is a single, named change that bridges one semver to another.
- A `MigrationRunner` applies pending migrations in semver order, each in its own transaction, and records applied migrations in a tracking table.

## Install

This package is workspace-private. Add it as a dependency from another package in this repo:

```json
{
  "dependencies": {
    "@khoralabs/sqlite-migrate": "*"
  }
}
```

## Usage

```ts
import { Database } from "bun:sqlite";
import { createMigrationRunner, type Migration } from "@khoralabs/sqlite-migrate";

import addUsers from "./migrations/0.1.0-0.2.0/001-add-users.ts";
import addSessions from "./migrations/0.1.0-0.2.0/002-add-sessions.ts";
import addEmail from "./migrations/0.2.0-0.3.0/001-add-email.ts";

const db = new Database("app.sqlite", { create: true });
const runner = createMigrationRunner();
const result = await runner.run(db, [addUsers, addSessions, addEmail]);

console.log(`applied ${result.applied.length}, skipped ${result.skipped.length}`);
console.log(`schema is now at ${result.finalVersion}`);
```

`bun:sqlite` is itself synchronous, so most callers will prefer `runSync`:

```ts
createMigrationRunner().runSync(db, [addUsers, addSessions, addEmail]);
```

A migration file is a TypeScript module whose default export implements `Migration`:

```ts
// migrations/0.1.0-0.2.0/001-add-users.ts
import type { Migration } from "@khoralabs/sqlite-migrate";

export default {
  from: "0.1.0",
  to: "0.2.0",
  name: "001-add-users",
  up(db) {
    db.run(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      )
    `);
  },
} satisfies Migration;
```

## Directory convention

Migrations live in a `migrations/` directory, grouped by the semver bridge they implement:

```
migrations/
  0.1.0-0.2.0/
    001-add-users.ts
    002-add-sessions.ts
  0.2.0-0.3.0/
    001-add-email-column.ts
    002-backfill-emails.ts
```

- **Directory name** encodes the bridge: `<from>-<to>` (e.g. `0.1.0-0.2.0/` migrates a DB from `0.1.0` to `0.2.0`). The same `from`/`to` strings appear on every `Migration` inside.
- **One file = one migration.** Each file handles a single logical change (one table, one column add, one backfill). Many files can live in a single bridge directory.
- **File names sort.** Files apply in lexicographic order within a bridge directory; prefix with a zero-padded counter (`001-`, `002-`, …).
- **The runner consumes an explicit list.** Import each migration and pass them as an array to `runner.run(db, [...])`. The runner sorts by `(from, to, name)` using semver order, so import order does not matter.

## Runner behavior

- On first run, the runner creates `_schema_migrations` (configurable via `tableName`):

  ```sql
  CREATE TABLE IF NOT EXISTS _schema_migrations (
    from_version TEXT NOT NULL,
    to_version   TEXT NOT NULL,
    name         TEXT NOT NULL,
    applied_at   INTEGER NOT NULL,
    PRIMARY KEY (from_version, to_version, name)
  );
  ```

- Migrations already present in `_schema_migrations` are skipped.
- Each pending migration runs inside its own `BEGIN` / `COMMIT`. If `up` throws, the runner issues `ROLLBACK`, rethrows, and stops — no later migrations are attempted.
- After the loop, `PRAGMA user_version` is set to `major * 1_000_000 + minor * 1_000 + patch` of the highest `to` in the input. This mirrors the existing user_version convention used elsewhere in the repo and gives a cheap integer probe of the current schema version.

## API

```ts
interface Migration {
  from: string; // "0.1.0"
  to: string;   // "0.2.0"
  name: string; // stable id, unique within (from, to)
  up(db: Database): void | Promise<void>;
}

interface MigrationRunner {
  run(db: Database, migrations: readonly Migration[]): Promise<MigrationResult>;
  /** Synchronous variant; throws if a migration's up() returns a Promise. */
  runSync(db: Database, migrations: readonly Migration[]): MigrationResult;
}

interface MigrationResult {
  applied: AppliedMigration[];
  skipped: AppliedMigration[];
  finalVersion: string | null;
}

function createMigrationRunner(opts?: { tableName?: string }): MigrationRunner;
```

Also exported: `parseSemver`, `compareSemver`, `encodeSemverForUserVersion`.

## Scope

- No down migrations.
- No filesystem auto-discovery — the caller imports migrations explicitly and passes them in.
- Only `MAJOR.MINOR.PATCH` semvers are supported (no pre-release / build metadata).
