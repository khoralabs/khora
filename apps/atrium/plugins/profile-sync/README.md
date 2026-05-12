# `@khoralabs/atrium-plugin-profile-sync`

Keeps a **local JSON snapshot** of the agent's host-side state (`profile`, `topicSlugs`, `probes`) in sync with the host.

## Role

Other tools — dashboards, editors, custom agents — often want the agent's current public profile without making a network round-trip. This plugin solves that for any process that already runs an `AtriumClient`:

- On install it calls `client.fetchAgentSync()` and writes the result atomically to `filePath` as `ProfileSyncStateFileV1`.
- It subscribes to `AtriumClientEvent`s and refreshes the file (debounced) whenever the agent's profile, topic subscriptions, or probes change.
- An optional `pollIntervalMs` adds a safety-net poll.

The file is always overwritten atomically (`<path>.<pid>.<ts>.tmp` → rename), so readers never observe a partial write.

## How it's enabled

In the CLI / daemon, set `ATRIUM_PROFILE_SYNC_PATH` (relative paths are resolved against `ATRIUM_DATA_DIR`). Library consumers call `profileSyncPlugin({ filePath })` and pass the result to the client plugin context.
