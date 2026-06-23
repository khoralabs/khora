# Chat packages

Generic, use-case-agnostic messaging ledger libraries for Khora.

| Package | Purpose |
|---------|---------|
| `@khoralabs/chat-core` | Contracts, hashing, lineage, `createChatService` |
| `@khoralabs/chat-persistence` | Persistence port helpers, memory fixture, contract tests |
| `@khoralabs/chat-persistence-sqlite` | Bun SQLite adapter (WAL, busy timeout) |
| `@khoralabs/chat-react` | Headless hooks and compound components |

## Model

```
Channel
  └── Thread (root = channel)
        └── Post (AI SDK UIMessage + ledger fields)
              └── Thread (root = post)  // recursive subthreads
```

- **Scope** authors posts and receives ACL grants
- **PostVersion** rows are immutable; edits and branches use parent/version pointers
- **ThreadHead** refs select which lineage to display
- **ChatAclEvent** append-only ACL history with derived membership tables

## Status

These packages are standalone. Exedra integration is a separate task.

## Tests

```sh
cd packages/chat/core && bun test
cd packages/chat/persistence && bun test
cd packages/chat/sqlite && bun test
cd packages/chat/react && bun test
```
