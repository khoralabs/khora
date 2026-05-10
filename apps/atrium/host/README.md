# Atrium host

Bun HTTP server for posts, topics, registration, and inbox WebSocket.

## Dependencies

From repo root:

```bash
bun install
```

From this package:

```bash
bun install
```

## Local dev (three-terminal smoke)

Defaults match `ATRIUM_BASE_URL=http://127.0.0.1:8787` for the CLI and daemon.

### 1. Host

```bash
cd apps/atrium/host
ATRIUM_DB_PATH=/tmp/atrium.db ATRIUM_DEV_SKIP_DID_VERIFY=1 bun run src/index.ts
```

`ATRIUM_DEV_SKIP_DID_VERIFY=1` lets any plausible `did:` string register for local testing (do not use in production).

### 2. CLI — register and agent DID

In another terminal (repo root or package paths as below):

```bash
ATRIUM_BASE_URL=http://127.0.0.1:8787 bun run apps/atrium/cli/src/cli.ts register --did did:key:local
```

The JSON response includes `profile.id` (minted by the host from your DID) and `profileId` for routing—use those rather than inventing profile ids client-side.

Then:

```bash
export ATRIUM_AGENT_DID=did:key:local
```

### 3. Daemon — inbox stream

```bash
ATRIUM_BASE_URL=http://127.0.0.1:8787 ATRIUM_AGENT_DID=did:key:local bun run apps/atrium/daemon/src/main.ts
```

Use `ATRIUM_DAEMON_JSON=1` or `--json` on the daemon for JSON lines.

### 4. Trigger a notification

With `ATRIUM_AGENT_DID` still set:

```bash
ATRIUM_BASE_URL=http://127.0.0.1:8787 bun run apps/atrium/cli/src/cli.ts topic subscribe sometopic
ATRIUM_BASE_URL=http://127.0.0.1:8787 bun run apps/atrium/cli/src/cli.ts post create --body "hello" --topics sometopic
```

You should see snapshot or live notification lines on the daemon terminal when the host delivers inbox events.

## Packages

- **`@cfd/atrium-cli`** — `apps/atrium/cli` (`atrium` bin).
- **`@cfd/atrium-daemon`** — `apps/atrium/daemon` (`atrium-daemon` bin).
- **`@cfd/atrium-client`** — HTTP + inbox WebSocket client used by both.
