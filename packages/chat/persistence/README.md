# @khoralabs/chat-persistence

Async persistence port implementations and shared adapter contract tests.

## Exports

- Re-exports persistence types from `@khoralabs/chat-core`
- `BaseChatPersistence` — shared validation helpers for adapters
- `prepareAppendPost`, `prepareEditPost`, `buildAclEventContentHash`
- `MemoryChatPersistence` / `createMemoryChatPersistence()` — test fixture
- `runChatPersistenceContractTests(name, factory)` — shared contract suite

## Contract tests

Adapter packages should run the shared suite:

```ts
import { runChatPersistenceContractTests } from "@khoralabs/chat-persistence";

runChatPersistenceContractTests("my-adapter", () => createMyAdapter());
```

Coverage includes channel/thread creation, recursive threads, append concurrency, edits, soft delete, ACL events, idempotency keys, and lineage walks.

## Design notes

- All APIs are async-first for workflow/process boundaries
- `appendPost` / `editPost` return typed head conflicts instead of silent overwrites
- Idempotency keys make workflow retries safe
- ACL mutations append signed events and maintain derived membership tables
