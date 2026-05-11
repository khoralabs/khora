# Atrium client plugins

Optional installers that hook into `AtriumClient`'s plugin context. They are consumed by the CLI and the daemon (via `ATRIUM_*` env vars resolved in `apps/atrium/cli/src/plugins-env.ts`) and can be loaded by any third-party `AtriumClient` host.

A plugin is a function `AtriumPluginInstaller = (ctx) => AtriumPluginHandle` that subscribes to client events (or otherwise hooks the client) and returns a `stop()` for shutdown.

| Plugin | Purpose |
| --- | --- |
| [`profile-sync/`](profile-sync) | Mirrors the agent's host-side profile, topics, and probes into a local JSON file. |
| [`inbox-buffer/`](inbox-buffer) | Persists every `AtriumClientEvent` into SQLite with bounded compaction policies. |
| [`telemetry/`](telemetry) | Appends every event to rotating JSONL files for archival / analysis. |
