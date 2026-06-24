# @khoralabs/chat-persistence-turso

Turso serverless adapter for the generic chat ledger.

## Exports

- `createTursoChatPersistence(db)` — async `ChatPersistence` over `SqlDatabase`
- `createTursoDatabase({ url, authToken })` — connect to Turso/libSQL
- `createLocalSqliteDatabase(path)` / `createMemorySqliteDatabase()` — local adapters for dev/tests
- `ensureChatSchema(db)` — create chat tables

## Example (Turso)

```ts
import {
  createTursoChatPersistence,
  createTursoDatabase,
  ensureChatSchema,
} from "@khoralabs/chat-persistence-turso";

const db = createTursoDatabase({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
await ensureChatSchema(db);
const persistence = createTursoChatPersistence(db);
```

## Example (local SQLite via SqlDatabase)

```ts
import {
  createLocalSqliteDatabase,
  createTursoChatPersistence,
  ensureChatSchema,
} from "@khoralabs/chat-persistence-turso";

const db = createLocalSqliteDatabase("./data/exedra-chat.db");
await ensureChatSchema(db);
const persistence = createTursoChatPersistence(db);
```

Writes use `BEGIN IMMEDIATE` / `COMMIT` transactions via the shared `SqlDatabase` helpers.
