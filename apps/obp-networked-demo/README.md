# OBP networked demo (two processes)

Separate [`FakeObpPersistence`](../../packages/obp/core/src/testing/fake-obp-persistence.ts) per process: each loads the same **party rows** from a bootstrap file, then runs frames plus **session envelope** sync on the **same** HTTP/2 `/obp/v1` stream (`sessionEnvelopeSync: true`). With split stores, the demo enables `graphApplyOutbound` so each peer applies proliferate/resolve to its own persistence (see `serveObp` / `connectObpSession` options).

**Multi-turn session:** one logical `connectObpSession` runs **two** responder proliferates (`demo-turn-1` → bind → `demo-turn-2` → bind) before **`TERMINATE`**. Shared offer/port ids live in [`scripts/demo-protocol.ts`](scripts/demo-protocol.ts).

## One-time: generate secrets

From this directory:

```sh
bun install
bun run bootstrap
```

Equivalent: `bun run scripts/gen-bootstrap.ts`.

Writes `.obp-demo-bootstrap.local.json` (gitignored by default). Set `OBP_DEMO_BOOTSTRAP` to an absolute path if you want a different file; keep custom paths out of version control. **Security: dev-only secrets** — the file holds Ed25519 private keys (JWK).

## Environment

| Variable | Default | Role |
|----------|---------|------|
| `OBP_DEMO_BOOTSTRAP` | `.obp-demo-bootstrap.local.json` (under cwd) | Bootstrap JSON path for server and client |
| `OBP_HOST` / `OBP_PORT` | `127.0.0.1` / `8765` | Server bind address |
| `OBP_URL` | `http://127.0.0.1:8765` | Client `connectObpSession` URL |

## Terminal A — keep server running

```sh
bun run server
```

Listens until **SIGINT/SIGTERM** (`Ctrl+C`), then closes cleanly.

## Terminal B — one-shot client

```sh
bun run client
```

One `connectObpSession` call (two proliferate/resolve rounds inside it), logs checkpoint summary, exits **0**.

## Scripts

| Script | Command |
|--------|---------|
| `bootstrap` | `bun run scripts/gen-bootstrap.ts` |
| `server` | `bun run scripts/server.ts` |
| `client` | `bun run scripts/client.ts` |
| `test` | `bun test` (bootstrap shape + e2e smoke) |
