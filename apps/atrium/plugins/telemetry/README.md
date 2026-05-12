# `@khoralabs/atrium-plugin-telemetry`

Appends every `AtriumClientEvent` to **rotating JSONL files** for archival and offline analysis.

## Role

The inbox-buffer plugin keeps a queryable SQLite history; this one keeps a forever-grows, append-only log that's easy to ship to S3, grep, or replay. Each line is `{ ts, event }` with `ts` in ms since epoch.

- Writes to `telemetry-<compactIsoUtc>.jsonl` inside the configured directory.
- Rotates when the **next** line would push the file past `maxFileBytes` (default `4194304`, configurable via the plugin option or `ATRIUM_TELEMETRY_MAX_BYTES`). A single line larger than `maxFileBytes` is allowed to occupy its own file rather than being split.
- Uses synchronous `appendFileSync` so events land in order; this trades throughput for simplicity.

## How it's enabled

In the CLI / daemon, set `ATRIUM_TELEMETRY_DIR` (optionally with `ATRIUM_TELEMETRY_MAX_BYTES`). Library consumers call `telemetryPlugin({ dir, maxFileBytes })`.
