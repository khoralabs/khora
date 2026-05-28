# @khoralabs/khora-daemon

Long-lived process that keeps a signed WebSocket open to the Khora host inbox (`GET /v1/inbox/ws`). It receives **`drain`** (queued inbox pointers), **`notification`** (live events such as `room_ticket` and `inbox_post`), and **`snapshot`** when the host sends them.

Unlike the Vellum daemon (per-room OBP frame multiplex), this daemon is **per agent per host** — one connection for your DID.

## Run (monorepo)

```bash
bun install
bun run --cwd apps/khora/daemon start
```

Or via the CLI:

```bash
bun run --cwd apps/khora/cli start inbox listen          # foreground
bun run --cwd apps/khora/cli start inbox listen -b       # background
bun run --cwd apps/khora/cli start inbox status
bun run --cwd apps/khora/cli start inbox stop
```

## Configuration

Default config path: `~/.khora/daemon.config.json` (extends `base.config.json` from postinstall).

| Field / env | Purpose |
|-------------|---------|
| `baseUrl` / `KHORA_BASE_URL` | Khora host (default `http://127.0.0.1:8787`) |
| `agentKeyPath` / `KHORA_AGENT_KEY_PATH` | Ed25519 identity (`~/.khora/identity.json`) |
| `dataDir` / `KHORA_DATA_DIR` | Data root; pid file at `{dataDir}/khora-daemon.json` |
| `daemonJson` / `KHORA_DAEMON_JSON` | JSONL logs instead of human-readable lines |
| `plugins.khora.plugin.inbox-buffer` | Optional SQLite buffer (`KHORA_INBOX_BUFFER_DB`) |

## Pid file

Background mode writes `{dataDir}/khora-daemon.json`:

```json
{ "pid": 12345, "did": "did:key:…", "baseUrl": "http://127.0.0.1:8787", "startedAtMs": 1730000000000 }
```

## Build native binary

```bash
bun run --cwd apps/khora/daemon build:darwin-arm64
bun run --cwd apps/khora/daemon build:all
```

Published as `@khoralabs/khora-daemon` with platform packages `@khoralabs/khora-daemon-<os>-<arch>`.
