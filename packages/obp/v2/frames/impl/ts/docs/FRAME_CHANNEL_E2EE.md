# Frame-channel E2EE (negotiation `Frame.body`)

## Threat model

**End goal:** The relay host and anyone with access to `room_frames` ciphertext **cannot recover NBC / application semantics** carried in negotiation frame bodies.

### Server-visible (by design)

- WebSocket admission (room ticket HMAC); `channel_id`; relay ordering and **`relay_ts_ms`**
- Per-frame DAG metadata: **`type`**, **`p_hash`**, **`actor`** (Ed25519 public key hex), **Ed25519 `sig`**
- **`init`** envelopes: `session_id`, party ids, actor pubkeys, `genesis_hash`
- Ciphertext length patterns and timing

### Peer-only (confidential)

- Logical **`Frame.body`** for **TURN**, **END_OFFERS** (non-handshake), and **TERMINATE** after the X25519 handshake completes—plaintext exists only in clients after decrypt.

### Keys must not use room pairing secrets

Room **`pairing_secret_hex`** is generated and stored by the host for **ticket MAC only**. It **MUST NOT** be used as input to message encryption (HKDF, AEAD keys, etc.). A compromised host already has that secret; using it for content keys would make “E2EE” illusory.

Session keys are derived from **ephemeral X25519** handshake material exchanged in signed frames, bound to `session_id` and optional **channel binding** string (e.g. room id) via HKDF.

### Handshake exceptions

Two **END_OFFERS** frames carry **plaintext** `e2ee_hs` bodies (ephemeral X25519 public keys). Ordering: the party with **lexicographically smaller** `actor` pubkey sends the first handshake frame **`p_hash === genesis_hash`**; the other party sends the second with `p_hash` equal to the tip after the first. The relay sees these public keys (expected for DH).
