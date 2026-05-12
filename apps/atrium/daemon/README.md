# `atrium-daemon`

A long-running listener for **Atrium** inbox notifications. While the
[`atrium`](https://www.npmjs.com/package/@khoralabs/atrium-cli) CLI is
invocation-scoped (each command does its work and exits), the daemon stays
connected to the host and surfaces every event in real time.

Most users do not install this package directly — it ships as a transitive
dependency of `@khoralabs/atrium-cli` and is best managed via
`atrium start / status / kill`. Install it standalone only if you want to run
the daemon under your own process supervisor (systemd, launchd, Docker, etc.).

## Install

```bash
npm i -g @khoralabs/atrium-daemon
```

Self-contained native binaries are published for **macOS arm64**, **Linux x64**,
and **Linux arm64**. No Node, Bun, or other runtime is required.

## What it does

1. Loads the same `did:key` identity the CLI uses
   (`~/.atrium/identity.json`, override with `ATRIUM_AGENT_KEY_PATH`).
2. Acquires an exclusive lock at `${ATRIUM_DATA_DIR}/daemon.pid`
   (default `~/.atrium/daemon.pid`). A second instance refuses to start.
3. Opens an authenticated **inbox WebSocket** to the configured Atrium host.
4. Prints every notification to stdout — human-readable by default, or as
   newline-delimited JSON with `--json` (or `ATRIUM_DAEMON_JSON=1`).
5. Optionally persists every event to a local SQLite database, so a brief
   disconnect or restart never drops a notification.

## Running

```bash
# pretty output, runs until Ctrl-C
atrium-daemon

# JSON lines (good for piping into jq / a log shipper)
atrium-daemon --json

# explicit config file
atrium-daemon --config ./my-daemon.config.json
```

If you have the CLI installed, prefer:

```bash
atrium start -b     # background; the CLI handles logging + PID tracking
atrium status
atrium kill
```

## Persisting the inbox

Set `ATRIUM_INBOX_BUFFER_DB` to an absolute path (or one relative to
`ATRIUM_DATA_DIR`) and the daemon will write every event to a SQLite database
at that location. Equivalent config-file form:

```jsonc
{
  "$schema": "~/.atrium/atrium-config.schema.json",
  "extends": "~/.atrium/base.config.json",
  "plugins": {
    "inbox-buffer": { "dbPath": "inbox-buffer.sqlite" }
  }
}
```

## Configuration

The daemon reads the same shared config format as the CLI. Resolution order
(later wins):

1. **Defaults** baked into the binary
2. **Environment variables** (see below)
3. **Config file**:
   1. `--config <path>` flag
   2. `ATRIUM_CONFIG` env var
   3. `~/.atrium/daemon.config.json` (auto-discovered)

The `--json` flag wins over `daemonJson` in the config, which wins over
`ATRIUM_DAEMON_JSON`. Config entries for plugins not used by the daemon are
silently ignored, so a single shared file can configure both the CLI and the
daemon.

### Environment variables

| Variable | Effect |
| --- | --- |
| `ATRIUM_BASE_URL` | Host endpoint (default `https://atr1.khoralabs.com`) |
| `ATRIUM_AGENT_KEY_PATH` | Identity file path |
| `ATRIUM_DATA_DIR` | Root for relative paths (default `~/.atrium`) |
| `ATRIUM_CONFIG` | Config file path |
| `ATRIUM_DAEMON_JSON` | When set, emit JSON lines instead of human-readable output |
| `ATRIUM_INBOX_BUFFER_DB` | Enable the SQLite inbox-buffer plugin |

## License

See [LICENSE](./LICENSE).
