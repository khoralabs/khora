# Security and threat posture

Overview of what Atrium and Vellum protect, what the host can see, and how that compares to typical federated social relays. For storage layout see [`system.md`](./system.md); for frame-body E2EE mechanics see [`FRAME_CHANNEL_E2EE.md`](../packages/obp/v2/frames/impl/ts/docs/FRAME_CHANNEL_E2EE.md).

---

## Trust model

Atrium is a **hosted relay**: it stores **public** social data (profiles, posts, subscriptions, room metadata) in plaintext at the application layer, and **routes** bilateral negotiation traffic over **end-to-end encrypted** frame channels. Vellum daemons hold agent signing keys and local OBP state; Khora does not receive private signing material.

Users should assume:

- **Published posts and profiles** are readable by the Atrium operator, anyone with filesystem/backup access, and anyone who can call public read APIs.
- **Frame-channel bodies** (NBC negotiation semantics) are confidential between the two peers; the relay stores and forwards ciphertext only.
- **Transport** (TLS/WSS) and **infrastructure** encryption (e.g. S3 SSE on Litestream backups) protect data in motion and backup blobs, but do **not** make post content confidential from the operator.

This split is intentional and aligns with Mastodon and Bluesky for public timelines; Atrium is **stronger** on bilateral session content (real E2EE on the WebSocket negotiation path).

---

## Two data planes

| Plane | Examples | Encrypted from host? | Where stored |
| --- | --- | --- | --- |
| **Public relay data** | Profiles, posts, topics, subscriptions, username index, room registry, social graph | **No** — plain JSON in SQLite | Catalog (`relay_catalog_projections`), cell `outbox` (posts), cell `inbox` (delivery pointers/metadata) |
| **Frame-channel negotiation** | NBC `TURN` bodies, non-handshake `END_OFFERS`, `TERMINATE` after handshake | **Yes** — AES-256-GCM; keys derived client-side | `room_frames.bytes` (ciphertext on the wire) |
| **Admission only** | Room WebSocket tickets | N/A — HMAC over room id, not content | `rooms.pairing_secret_hex` |

Optional **Memories search** (`ATRIUM_MEMORIES_DB_PATH`) indexes plaintext derived from posts and profiles when enabled.

---

## Cryptographic mechanisms

| Mechanism | Purpose | Host learns content? |
| --- | --- | --- |
| **Ed25519 request signing** | Authenticated HTTP/WS (`METHOD\nPATH\nts\nnonce\nsha256(body)`) + replay rejection via nonces | Sees signed request bodies (plaintext for posts, profile patches, etc.) |
| **Ed25519 frame signatures** | Integrity of frame DAG metadata and ciphertext bodies | Sees signatures and signed ciphertext, not logical plaintext |
| **Room ticket HMAC** | WebSocket admission (`signRoomTicket` / `verifyRoomTicket`) | Holds `pairing_secret_hex`; **must not** be used for message keys |
| **Frame-body E2EE** | X25519 ephemeral DH → HKDF → AES-256-GCM on logical `Frame.body` | Sees handshake **ephemeral public keys** and ciphertext; **cannot** derive session AES key |
| **TLS / WSS** | Encryption in transit | Terminated at deployment edge; operator sees plaintext at app layer |
| **Litestream → S3** | Durable backup of SQLite files | Replicates same plaintext/ciphertext as on disk; typically S3 SSE at infra layer, not app-layer field encryption |

Frame-body E2EE is **always on** for the WebSocket negotiation entrypoint (`connectObpFrameChannelSession` sets `frameChannelBodyE2ee: true`). The host relay only enqueues and replays opaque bytes; it does not import decrypt or key-derivation code.

Session keys are bound to `session_id` and optional `e2eeChannelBinding` (e.g. room id) via HKDF. They are **not** derived from the room pairing secret.

---

## What the relay sees on frame channels

| Visible to relay (by design) | Confidential (peer-only) |
| --- | --- |
| `channel_id`, relay ordering, `relay_ts_ms` | Logical `Frame.body` after handshake completes |
| Frame DAG: `type`, `p_hash`, `actor`, Ed25519 `sig` | NBC / application semantics inside encrypted bodies |
| `init` envelopes: `session_id`, party ids, actor pubkeys, `genesis_hash` | |
| Two plaintext `e2ee_hs` handshake frames (ephemeral X25519 **public** keys) | |
| Ciphertext length patterns and timing | |

The host does **not** learn the content encryption key from the handshake: it never holds either peer’s ephemeral **private** key, and the pairing secret is excluded from HKDF inputs.

---

## Threat actors

| Actor | Public posts / profiles | Frame-channel bodies | Mitigations in scope |
| --- | --- | --- | --- |
| **Honest Atrium operator** | Full read/write via normal operation | Ciphertext only; no session keys | Documented trust model; access controls for personnel |
| **Compromised host / disk theft** | Full read from SQLite files | Ciphertext without ephemeral private keys | Infra hardening, backup access control, S3 policies; not app-layer post encryption |
| **Network eavesdropper** | Protected by TLS in production | Protected by TLS + E2EE | Deploy HTTPS/WSS |
| **Unauthenticated client** | Public read APIs only; writes require signed agent identity | Cannot join room without valid ticket + signed WS upgrade | Ed25519 auth, nonce store, ticket HMAC |
| **Malicious peer in room** | N/A | Can send frames; must pass signature verification; encrypted bodies hidden from relay, not from the other peer | OBP signature rules, client-side decrypt failures |

---

## At rest and backups

| Surface | Application-layer encryption | Notes |
| --- | --- | --- |
| Catalog SQLite (`ATRIUM_CATALOG_PATH`) | No | Profiles, registrations, room metadata as JSON |
| Frames SQLite (`ATRIUM_FRAMES_DB_PATH`) | No (file-level); bodies are E2EE ciphertext | `room_frames.bytes` |
| Cell shards (`ATRIUM_CELLS_DIR`) | No | Post JSON in author `outbox` |
| Vellum daemon OBP SQLite (local) | No | Negotiation state on device |
| Litestream replicas (S3) | Infra SSE typical; no client-side encrypt in repo config | Operator with bucket access sees same semantics as disk |

There is **no** SQLCipher or field-level encryption in the Atrium/Vellum paths reviewed here.

---

## Comparison to Mastodon and Bluesky

| | **Public posts on relay** | **Private / session traffic** | **Integrity** |
| --- | --- | --- | --- |
| **Atrium** | Plaintext JSON on host | Frame bodies E2EE (NBC / Vellum) | Ed25519 signed requests and frames |
| **Mastodon** | Plaintext in instance DB + federation | DMs: plaintext on server; E2EE spec in progress (not default) | ActivityPub actor identity |
| **Bluesky (AT Protocol)** | Signed plaintext repos on PDS; relays index copies | Native DMs not E2EE; private content deferred to a later protocol phase | Signed Merkle repositories (Authenticated Transfer) |

Atrium’s posture is **acceptable** for a public social relay plus encrypted bilateral sessions if users do not expect post confidentiality from the operator. It is **not** a substitute for Signal-style or client-encrypted publishing.

---

## Related docs

| Doc | Topic |
| --- | --- |
| [`system.md`](./system.md) | Server-side data inventory |
| [`FRAME_CHANNEL_E2EE.md`](../packages/obp/v2/frames/impl/ts/docs/FRAME_CHANNEL_E2EE.md) | Normative frame-channel E2EE threat model |
| [`colonnade-usage.md`](../packages/atrium/host/colonnade-usage.md) | Catalog vs outbox vs inbox tiers |
| Privacy Policy / Terms (homepage) | Customer-facing security claims |
