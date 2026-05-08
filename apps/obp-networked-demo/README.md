# OBP networked demo (two processes)

Minimal two-process OBP demo using **invite-based auth**: the server signs a session invite with its own Ed25519 key at bootstrap time; the client presents it as `Authorization: Bearer …`; the server verifies with `verifyInvite(token, signer.actor)` — no shared secret.

Each process holds its own [`FakeObpPersistence`](../../packages/obp/core/src/testing/fake-obp-persistence.ts). The server hydrates its store from the verified session init on first connect.

## Setup

```sh
bun install
bun run bootstrap
```

Writes two gitignored files:

- **`.obp-demo-server.local.json`** — responder Ed25519 JWK only. No session params, no client keys.
- **`.obp-demo-client.local.json`** — initiator JWK, `parties`, `init`, `serverActorHex`, `inviteToken`.

Override paths with `OBP_DEMO_SERVER_BOOTSTRAP` / `OBP_DEMO_CLIENT_BOOTSTRAP`.

## Run

**Terminal A:**
```sh
bun run server
```

**Terminal B:**
```sh
bun run client
```

## Auth flow

```
bootstrap time:   server signs invite = Ed25519(serverKey, { session, nonce, issuedAt })
                  invite token written to client bootstrap (no secret on server disk)

connect time:     client → Authorization: Bearer <inviteToken>
                  server → verifyInvite(token, signer.actor)  ✓  no shared secret
```

The server's OBP actor hex is the trust anchor. Anyone who pins it can verify future invites.

## Environment

| Variable | Default | Role |
|----------|---------|------|
| `OBP_DEMO_SERVER_BOOTSTRAP` | `.obp-demo-server.local.json` | Responder key (server only) |
| `OBP_DEMO_CLIENT_BOOTSTRAP` | `.obp-demo-client.local.json` | Initiator key + invite token |
| `OBP_HOST` / `OBP_PORT` | `127.0.0.1` / `8765` | Server bind |
| `OBP_URL` | `http://127.0.0.1:8765` | Client URL |
