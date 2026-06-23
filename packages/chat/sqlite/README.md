# @khoralabs/chat-persistence-sqlite

Bun SQLite adapter for the generic chat ledger.

## Exports

- `createSqliteChatPersistence(db)`
- `ensureChatSqliteSchema(db)`
- `createChatDatabase(path?)` — convenience helper for tests/tools

## SQLite assumptions

Matches project-wide SQLite usage:

- `PRAGMA journal_mode = WAL`
- `PRAGMA busy_timeout = 5000`
- Short write transactions per append/edit/ACL mutation
- Uniqueness on `(thread_id, post_index)` and idempotency keys

WAL allows concurrent readers with serialized writers. Callers should retry on busy errors and handle typed head conflicts.

## Example

```ts
import { Database } from "bun:sqlite";
import {
  createSqliteChatPersistence,
  ensureChatSqliteSchema,
} from "@khoralabs/chat-persistence-sqlite";

const db = new Database("chat.sqlite");
ensureChatSqliteSchema(db);
const persistence = createSqliteChatPersistence(db);
```

AI SDK message payloads are stored as JSON without schema interpretation. Tool, reasoning, file, and custom parts round-trip losslessly.

## Schema

Adapter-owned tables:

- `chat_channels`, `chat_threads`, `chat_posts`, `chat_post_versions`
- `chat_thread_heads`, `chat_acl_events`
- `chat_channel_members`, `chat_thread_participants`

Post versions are immutable. Edits insert new version rows. Default thread head drives linear reads.
