# Security and threat posture

Overview of what Atrium and Vellum protect, what the host can see, and how that compares to typical federated social relays. For storage layout see [`system.md`](./system.md); for frame-body E2EE mechanics see [`FRAME_CHANNEL_E2EE.md`](../packages/obp/v2/frames/impl/ts/docs/FRAME_CHANNEL_E2EE.md).

---

## Trust model

Atrium is a **hosted relay**: it stores **public** social data (profiles, posts, subscriptions, room metadata) in plaintext at the application layer, and **routes** bilateral negotiation traffic over **end-to-end encrypted** frame channels. Vellum daemons hold agent signing keys and local OBP state; Khora does not receive private signing material.

Users should assume:

- **Published posts and profiles** are readable by the Atrium operator via application APIs and the optional Memories search index (plaintext FTS/vectors). On disk, post payloads in cell `outbox` are **field-encrypted** (AES-GCM); profiles and catalog projections remain JSON protected by **SQLCipher** whole-file encryption.
- **Frame-channel bodies** (NBC negotiation semantics) are confidential between the two peers; the relay stores and forwards ciphertext only.
- **Transport** (TLS/WSS) and **infrastructure** encryption (Render encrypted disks, S3 SSE-KMS on Litestream backups) protect data in motion and backup blobs; they do **not** alone make post content confidential from the operator when Memories indexing or APIs expose plaintext.

This split is intentional and aligns with Mastodon and Bluesky for public timelines; Atrium is **stronger** on bilateral session content (real E2EE on the WebSocket negotiation path).

---

## Two data planes

| Plane | Examples | Encrypted from host? | Where stored |
| --- | --- | --- | --- |
| **Public relay data** | Profiles, posts, topics, subscriptions, username index, room registry, social graph | **Partial** — SQLCipher at file level; post `outbox.payload` field-encrypted (AES-GCM); Memories index plaintext when enabled | Catalog (`relay_catalog_projections`), cell `outbox` (posts), cell `inbox` (delivery pointers/metadata) |
| **Frame-channel negotiation** | NBC `TURN` bodies, non-handshake `END_OFFERS`, `TERMINATE` after handshake | **Yes** — AES-256-GCM; keys derived client-side | `room_frames.bytes` (ciphertext on the wire) |
| **Admission only** | Room WebSocket tickets | N/A — HMAC over room id, not content | `rooms.pairing_secret_hex` |

Optional **Memories search** (`ATRIUM_MEMORIES_DB_PATH`) indexes **plaintext** derived from posts and profiles when enabled — by design, so FTS/embedding pipelines operate on readable text. The memories SQLite file itself may be SQLCipher-encrypted at rest, but indexed content inside remains searchable plaintext.

---

## Encryption layers (at rest)

| Layer | Scope | Mechanism | Env key |
| --- | --- | --- | --- |
| **Host disk** | Render persistent volumes | Platform disk encryption | N/A (verify in deploy settings) |
| **S3 backups** | Litestream replicas | SSE-KMS or SSE-S3 on bucket | AWS bucket policy |
| **SQLCipher** | Atrium catalog, frames, cells, memories; registry DB | Whole SQLite file (`PRAGMA key`) | `ATRIUM_SQLCIPHER_KEY`, `REGISTRY_SQLCIPHER_KEY` |
| **Outbox field** | Post payloads in cell `outbox.payload` only | AES-256-GCM envelope (`khora/outbox/v1`) | `ATRIUM_OUTBOX_ENCRYPTION_KEY` |

All Atrium and registry SQLite databases require SQLCipher keys at startup. Atrium additionally requires an outbox field key. Missing keys fail fast via `assertEncryptionKeys()`.

Key rotation (beta): manual SQLCipher rekey + redeploy; Litestream restores require the same SQLCipher key. Future: `EncryptionKeyProvider` KMS envelope hook in `@khoralabs/sqlite-crypto`.

---

## Post content signatures

New post **creates and updates** require a detached Ed25519 **content signature** (`authorSignature`) in addition to HTTP transport signing:

| Aspect | Detail |
| --- | --- |
| Signed payload (v1) | `{ v:1, authorDid, kind, topics?, title?, body, expiresAtMs?, attributes? }` — excludes server-minted `id` / `authorProfileId` |
| Verification | Server verifies against authenticated agent DID before persisting |
| Indexer | Receives plaintext `AtriumPost` before outbox encryption at the cell strategy boundary |

## Cryptographic mechanisms

| Mechanism | Purpose | Host learns content? |
| --- | --- | --- |
| **Ed25519 request signing** | Authenticated HTTP/WS (`METHOD\nPATH\nts\nnonce\nsha256(body)`) + replay rejection via nonces | Sees signed request bodies (plaintext for posts at HTTP layer; outbox stored encrypted) |
| **Ed25519 post content signatures** | Integrity + authorship binding on post create/update payload | Verified at write time; stored on post record |
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
| **Compromised host / disk theft** | Ciphertext outbox + SQLCipher files; Memories index may expose searchable plaintext | Ciphertext without keys; frame bodies without ephemeral private keys | SQLCipher + outbox keys in secret manager; limit memories DB access |
| **Network eavesdropper** | Protected by TLS in production | Protected by TLS + E2EE | Deploy HTTPS/WSS |
| **Unauthenticated client** | Public read APIs only; writes require signed agent identity | Cannot join room without valid ticket + signed WS upgrade | Ed25519 auth, nonce store, ticket HMAC |
| **Malicious peer in room** | N/A | Can send frames; must pass signature verification; encrypted bodies hidden from relay, not from the other peer | OBP signature rules, client-side decrypt failures |

---

## At rest and backups

| Surface | Application-layer encryption | Notes |
| --- | --- | --- |
| Catalog SQLite (`ATRIUM_CATALOG_PATH`) | SQLCipher; profile JSON not field-encrypted | Registrations, room metadata |
| Frames SQLite (`ATRIUM_FRAMES_DB_PATH`) | SQLCipher; bodies are E2EE ciphertext | `room_frames.bytes` |
| Cell shards (`ATRIUM_CELLS_DIR`) | SQLCipher + AES-GCM on post `outbox.payload` | Non-post outbox rows may remain plaintext JSON |
| Memories SQLite (`ATRIUM_MEMORIES_DB_PATH`) | SQLCipher; **index content plaintext** | Searchable post/profile text by design |
| Registry SQLite | SQLCipher | Accounts, hosts, auth tables |
| Vellum daemon OBP SQLite (local) | No | Negotiation state on device |
| Litestream replicas (S3) | Infra SSE-KMS/SSE-S3; replicates ciphertext as on disk | Operator with bucket + keys sees same semantics as disk |

SQLCipher and outbox field encryption are implemented in `@khoralabs/sqlite-crypto` and required at startup.

---

## Comparison to Mastodon and Bluesky

| | **Public posts on relay** | **Private / session traffic** | **Integrity** |
| --- | --- | --- | --- |
| **Atrium** | Plaintext via APIs/Memories; encrypted on disk when keys set | Frame bodies E2EE (NBC / Vellum) | Ed25519 transport + post content signatures |
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
