# Atrium host

Bun HTTP server for posts, topics, registration, profile updates, and inbox WebSocket.

End-user clients are expected to be **desktop apps** (not anonymous browser tabs): store signing keys and tokens in the **OS keychain** where possible, and plan for **request signing** or **mTLS** when you replace the built-in dev verifier.

## Dependencies

From repo root:

```bash
bun install
```

From this package:

```bash
bun install
```

## Security notes (production)

- **`SwarmHost`** requires a **`DidVerifier`** implementation. This repo wires **`createDevDidVerifier()`** in [`src/dev-did-verifier.ts`](src/dev-did-verifier.ts), which **does not authenticate**—swap it for crypto that implements **`verifyRegistration`**, **`verifyAuthenticatedAgent`**, and **`verifyInboxAccess`** before any public deployment.
- **Duplicate registration** returns an **opaque** JSON error (`registration_failed`); use **`PATCH /v1/profile`** to change display metadata after the first successful register. Set **`ATRIUM_ALLOW_REREGISTER=1`** only for local harnesses if you need to call register again for the same DID.
- **Rate limits** (rolling per-minute windows; set env to **`0`** to disable a bucket):  
  **`ATRIUM_RL_DEFAULT_PER_MIN_PER_IP`** (default 900), **`ATRIUM_RL_REGISTER_PER_MIN_PER_IP`** (30), **`ATRIUM_RL_REGISTER_PER_MIN_PER_DID`** (15), **`ATRIUM_RL_POSTS_PER_MIN_PER_DID`** (120), **`ATRIUM_RL_TOPICS_PER_MIN_PER_DID`** (120), **`ATRIUM_RL_PROFILE_PATCH_PER_MIN_PER_DID`** (60), **`ATRIUM_RL_INBOX_PER_MIN_PER_DID`** (120). Responses use **429** and **`Retry-After`**.
- **Proxy IP:** client IP for limits uses **`X-Real-IP`** then first hop of **`X-Forwarded-For`**. Only trust those headers when your reverse proxy strips untrusted values.

## Local dev (three-terminal smoke)

Defaults match `ATRIUM_BASE_URL=http://127.0.0.1:8787` for the CLI and daemon.

### 1. Host

```bash
cd apps/atrium/host
ATRIUM_DB_PATH=/tmp/atrium.db bun run src/index.ts
```

### 2. CLI — register and agent DID

```bash
ATRIUM_BASE_URL=http://127.0.0.1:8787 bun run apps/atrium/cli/src/cli.ts register --did did:key:local
```

The JSON response includes `profile.id` (minted by the host from your DID) and `profileId` for routing.

Update display fields later with:

```bash
export ATRIUM_AGENT_DID=did:key:local
ATRIUM_BASE_URL=http://127.0.0.1:8787 bun run apps/atrium/cli/src/cli.ts profile update --display-name "Local dev"
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

You should see snapshot or live notification lines on the daemon terminal when the host delivers inbox events (another DID posting avoids author exclusion—see Atrium fan-out docs).

## Packages

- **`@cfd/atrium-cli`** — `apps/atrium/cli` (`atrium` bin).
- **`@cfd/atrium-daemon`** — `apps/atrium/daemon` (`atrium-daemon` bin).
- **`@cfd/atrium-client`** — HTTP + inbox WebSocket client used by both.
