# Vellum Channels — Local vs Relay State

Understanding the split between channel-relay spawn and local daemon state is important for using the Vellum CLI correctly.

**Protocol specs** (normative behavior, not implementation):

- [`packages/vellum/spec/channel-relay-deployment.md`](../../packages/vellum/spec/channel-relay-deployment.md) — **canonical:** one container = one channel; OOB join tokens
- [`packages/vellum/spec/channel-control-protocol.md`](../../packages/vellum/spec/channel-control-protocol.md) — limits, roster, chain slots, attach credentials
- [`.brain/technical/channel-lifecycle.md`](channel-lifecycle.md) — protocol event matrix

**Terminology:** one **channel** = one nonce-gated byte **multiplex** (`channel_id`). Production intent is **one relay container per channel**; parties coordinate OOB and distribute single-use join tokens. The current `channel-relay` app can also run as a **multi-tenant pool** for local dev. OBP **hub** = relay stamping on a stream — not a "channel hub."

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

## Channel-relay

**Canonical deployment** ([`channel-relay-deployment.md`](../../packages/vellum/spec/channel-relay-deployment.md)): one container, one `channel_id`, join via **single-use token OOB**. Policy (`maxPopulation`, `maxChains`, chain allocate/release) is still enforced on that instance.

**Reference pool app** (`apps/vellum/channel-relay`): multi-tenant Bun server for local dev — SQLCipher registry + frame store, DID-signed HTTP, `invite_only` admission, `VELLUM_RELAY_MAX_CHANNELS`.

### Control-plane routes

| Route | Purpose |
|-------|---------|
| `POST /v1/channels` | Create channel — pool only (`VELLUM_CHANNEL_ID` mode returns 501) |
| `POST /v1/channels/join` | Redeem join token → roster + attach creds |
| `POST /v1/channels/:id/join-tokens` | Mint single-use join token for OOB distribution |
| `POST /v1/channels/:id/chains/allocate` | Reserve bilateral chain slot |
| `GET /v1/channels/:id/chains/:sessionId` | Chain slot status (daemon gate) |
| `POST /v1/channels/:id/chains/:sessionId/release` | Release chain slot |
| `POST /v1/channels/:id/ticket` | Mint ticket + one-time upgrade nonce (members only) |
| `POST /v1/channels/:id/ws-nonce` | Mint upgrade nonce only (re-attach) |
| `GET /v1/channels/:id/ws` | WebSocket upgrade (`Sec-WebSocket-Protocol: vellum.nonce.<nonce>`) |
| `GET /health` | Liveness |

Khora (`KHORA_BASE_URL`) remains discovery-only (`register`, `whoami`).

### Chain limits (`maxChains`)

```ts
{ mode: "global", measure: N }     // channel-wide active chain cap
{ mode: "principal", measure: N }   // equal quota per member on join
```

`vellum chain create` calls relay **allocate** before daemon `chain/init` (`--peer-did` required).

---

## OBP SQLite (per channel)

Each channel's `obp.sqlite` contains the full OBP v2 schema plus `vellum_chains`. The relay holds ciphertext frames only — not negotiation state.

---

## CLI → daemon communication

Chain/offer/port/policy commands use `--channel <id>` and talk to the local daemon HTTP control server. The daemon multiplexes OBP over the channel-relay WebSocket.

```
vellum --channel <id> chain create --peer-did <did> ...
  → relay POST /v1/channels/:id/chains/allocate
  → reads vellum.json (controlPort)
  → HTTP POST to localhost:<controlPort>/chain/init
  → daemon sends OBP frame over channel WS
```
