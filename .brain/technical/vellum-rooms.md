# Vellum Rooms — Local vs Server State

Understanding the split between server-side room creation and local daemon state is important for using the Vellum CLI correctly.

---

## The disconnect

| Command | What it does |
|--------|----------------|
| `vellum room create` | Server-side room creation via API only — **no** local state written |
| `vellum list` | **Local filesystem only** — directories under `obp/rooms/` + `vellum.json` written by the daemon |

After `room create`, the room does **not** appear in `vellum list`. You must run `vellum connect <roomId>` first, which spawns the daemon and creates the local directory structure.

---

## Server-side: `vellum room create`

Calls `POST /v1/rooms` on the Khora host and prints the JSON response. Nothing writes to `~/.vellum/`.

The response includes:
- `roomId` — the UUID to use with `vellum connect`
- `joinToken` (if open invite) — for `vellum room join`

Similarly, `vellum room join` only calls `POST /v1/rooms/join` and prints JSON — it does not register the room locally.

---

## Local state: `vellum connect`

`VellumClient.connect()` spawns the Vellum daemon for a room. The daemon:

1. Resolves the local data directory (`~/.vellum/data` by default, or `VELLUM_DATA_DIR`)
2. Creates the OBP SQLite directory: `{dataDir}/obp/rooms/<roomId>/`
3. Opens `obp-state.sqlite` — the per-room OBP v2 database
4. Starts a local HTTP control server on a random port
5. Writes `vellum.json` — the control file that `vellum list` reads

### `vellum.json` contents
```json
{
  "pid": 12345,
  "controlPort": 54321,
  "roomId": "<uuid>"
}
```

`vellum list` reads all `obp/rooms/*/vellum.json` files and checks if the process is alive (via pid) to display `status: running | stale`.

---

## Local storage path

```
$VELLUM_OBP_STORE_ROOT    (if set)
  or
{dataDir}/obp/            (default: ~/.vellum/data/obp/)
  └── rooms/
      └── <roomId>/
          ├── vellum.json       ← control file (pid, controlPort)
          └── state.sqlite      ← OBP v2 tables
```

Override: `VELLUM_OBP_STORE_ROOT` or `ATRIUM_OBP_STORE_ROOT` env vars.

---

## OBP SQLite (per room)

Each room's `state.sqlite` contains the full OBP v2 schema:

```sql
obp_parties
obp_offers
obp_ports
obp_extends
obp_exposes
obp_binds
vellum_chains   -- session_id, genesis_hash, created_ms
```

This is the complete local negotiation state. The Khora relay never holds this data — only the E2EE ciphertext of frames passing through the room's WebSocket channel.

---

## CLI → daemon communication

The Vellum CLI commands that operate on an active session (chain creation, offers, ports, binds) talk to the local daemon's HTTP control server — they do not call the Khora host directly. The daemon multiplexes the OBP protocol over the Khora room WebSocket.

Flow:
```
vellum chain create --room <id>
  → reads vellum.json (controlPort)
  → HTTP POST to localhost:<controlPort>/chains
  → daemon sends OBP frame over Khora room WS
  → remote daemon receives frame, updates its OBP SQLite
```
