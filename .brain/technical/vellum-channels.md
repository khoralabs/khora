# Vellum Channels — Local vs Relay State

Understanding the split between channel-relay spawn and local daemon state is important for using the Vellum CLI correctly.

---

## The disconnect

| Command | What it does |
|--------|----------------|
| `vellum channel create` | Relay-side channel creation via `POST /v1/channels` — **no** local state written |
| `vellum list` | **Local filesystem only** — directories under `obp/channels/` + `vellum.json` written by the daemon |

After `channel create`, the channel does **not** appear in `vellum list`. Run `vellum channel connect <channelId>` (or `vellum connect`) to spawn the daemon and create the local directory structure.

---

## Relay: `vellum channel create`

Calls `POST /v1/channels` on the Vellum channel-relay (`VELLUM_BASE_URL`) and prints JSON. Nothing writes to `~/.vellum/`.

The response includes:
- `channelId` — UUID for `vellum connect`
- `inviteToken` — for `vellum channel join`

`vellum channel join` calls `POST /v1/channels/join` and prints JSON — it does not register the channel locally.

---

## Local state: `vellum connect`

`VellumClient.connect()` spawns the Vellum daemon for a channel. The daemon:

1. Resolves the local data directory (`~/.vellum/data` by default, or `VELLUM_DATA_DIR`)
2. Creates the OBP SQLite directory: `{dataDir}/obp/channels/<channelId>/`
3. Opens `obp.sqlite` — the per-channel OBP v2 database
4. Starts a local HTTP control server on a random port
5. Writes `vellum.json` — the control file that `vellum list` reads

### `vellum.json` contents
```json
{
  "pid": 12345,
  "controlPort": 54321,
  "channelId": "<uuid>"
}
```

`vellum list` reads all `obp/channels/*/vellum.json` files and checks if the process is alive (via pid) to display `status: running | stale`.

---

## Local storage path

```
$VELLUM_OBP_STORE_ROOT    (if set)
  or
{dataDir}/obp/            (default: ~/.vellum/data/obp/)
  └── channels/
      └── <channelId>/
          ├── vellum.json       ← control file (pid, controlPort)
          └── obp.sqlite        ← OBP v2 tables
```

Override: `VELLUM_OBP_STORE_ROOT` env var.

---

## Channel-relay (slice 1)

`apps/vellum/channel-relay` is an ultra-minimal Bun app:

- **Deps:** `@khoralabs/obp-frame-relay`, `@noble/ed25519` only
- **Store:** in-memory frame hub (ephemeral — restart drops channels)
- **Auth:** inline DID-signed HTTP (no Khora registration lookup)
- **Routes:** `/v1/channels`, `/v1/channels/join`, `/v1/channels/:id/ticket`, `/v1/channels/:id/ws`

Khora (`KHORA_BASE_URL`) remains discovery-only (`register`, `whoami`).

---

## OBP SQLite (per channel)

Each channel's `obp.sqlite` contains the full OBP v2 schema plus `vellum_chains`. The relay holds ciphertext frames only — not negotiation state.

---

## CLI → daemon communication

Chain/offer/port/policy commands use `--channel <id>` and talk to the local daemon HTTP control server. The daemon multiplexes OBP over the channel-relay WebSocket.

```
vellum --channel <id> chain create ...
  → reads vellum.json (controlPort)
  → HTTP POST to localhost:<controlPort>/chain/init
  → daemon sends OBP frame over channel WS
```
