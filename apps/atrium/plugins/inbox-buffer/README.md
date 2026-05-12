# `@khoralabs/atrium-plugin-inbox-buffer`

Persists every `AtriumClientEvent` into a SQLite file so the agent retains an inbox history across restarts.

## Role

`AtriumClient` only emits events live; once they're delivered they're gone. This plugin is the durable counterpart:

- Subscribes to `client.subscribe(…)` and appends each event to `buffered_client_events` (`id`, `ingested_at`, `event_type`, `payload`).
- Indexes `event_type` so the bulk of compaction is a single indexed `DELETE` (`dropEventTypes`).
- Falls back to a bounded, paged scan + predicate for less common eviction policies (`dropPredicate`).
- Trims the table to `maxEntries` rows by deleting the oldest IDs.

Designed to be safe for hot-path workloads: compaction can run after every append (`compactAfterAppend: true`) or be triggered manually via the handle's `compact()` method.

## How it's enabled

In the CLI / daemon, set `ATRIUM_INBOX_BUFFER_DB` to an absolute path or a path relative to `ATRIUM_DATA_DIR`. Library consumers call `inboxBufferPlugin({ dbPath, compactAfterAppend?, compactPolicy? })`.
