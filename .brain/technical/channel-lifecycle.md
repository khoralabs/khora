# Channel Lifecycle

Protocol-level events for a Vellum **channel** — one nonce-gated byte multiplex (`channel_id`). This document describes **what happens** at each stage, not which SQLite tables or apps implement it.

Related: [`channel-relay-deployment.md`](https://github.com/khoralabs/vellum/blob/main/packages/spec/channel-relay-deployment.md) (canonical **one container = one channel**), [`channel-control-protocol.md`](https://github.com/khoralabs/vellum/blob/main/packages/spec/channel-control-protocol.md), [`vellum-channels.md`](vellum-channels.md) (CLI/local daemon), [`khora-vellum-separation.md`](khora-vellum-separation.md). Relay persistence: [`relay`](https://github.com/khoralabs/relay) (`@khoralabs/relay-server-http`, `relay_channels`, `relay_spool`).

**Chain negotiation lifecycle** (bilateral DAG, bind windows, turns) is defined by NBC — see [`packages/obp/nbc/spec/model/negotiated-binding-convention.smithy`](../../packages/obp/nbc/spec/model/negotiated-binding-convention.smithy). This doc only covers **permission to open** a chain slot on the multiplex.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Channel** | One `channel_id` = one lightweight byte multiplex. N principals may join the roster over time; multiple bilateral NBC chains share the stream via distinct `session_id` / `SessionInit` envelopes. |
| **Relay container** | One OS process / container hosts **exactly one** `channel_id` (canonical). A multi-tenant **pool** (dev reference) may host many — see deployment doc. |
| **OBP hub policy** | `RelayEnvelope` stamping on forwarded frames ([`hub-protocol.smithy`](../../packages/obp/frame-relay/spec/model/hub-protocol.smithy)). Not "channel hub" product language. |

---

## Lifecycle matrix

| Event | Control-plane trigger | Multiplex / frame store | Roster / policy |
|-------|----------------------|-------------------------|-----------------|
| **channel_bootstrapped** | Container start / orchestrator spawn (canonical) or `POST /v1/channels` (pool) | Admission secret upserted; spool purged | Creator on roster; policy frozen (`maxPopulation?`, `maxChains`) |
| **join_token_issued** | `POST .../join-tokens` or pool create `inviteToken` | — | Single-use token (hashed at rest); distributed **OOB** |
| **member_joined** | `POST /v1/channels/join` (token redeem) | — | Principal added to roster; **`maxPopulation` enforced if configured**; re-join same DID is idempotent |
| **upgrade_nonce_minted** | ticket/join/create responses or `POST .../ws-nonce` | One-time nonce row (60s TTL, single consume) | Member only (or included in join/ticket mint) |
| **multiplex_attached** | `GET /v1/channels/:id/ws` + `Sec-WebSocket-Protocol: vellum.nonce.<nonce>` | Spool replay from cursor 0, then live fan-out | Valid one-time nonce; **not** a roster join |
| **chain_slot_allocated** | `POST /v1/channels/:id/chains/allocate` | — | Bilateral slot `(party_a_did, party_b_did, session_id)` under `maxChains` policy |
| **chain_slot_released** | `POST /v1/channels/:id/chains/:sessionId/release` | — | Slot marked released; quota freed |
| **channel_expired** | `expires_at_ms` elapsed | Admission inactive; nonce verify fails | Roster rows may remain until GC; attach/mint fail |

---

## Admission → `member_joined`

The only admission path in both profiles: `POST /v1/channels/join` with a single-use join token received OOB. Token is minted by any existing roster member via `POST .../join-tokens` (or returned as `inviteToken` on pool `POST /v1/channels`).

---

## After `chain_slot_allocated` (pointer to NBC)

1. Both principals run bilateral `SessionInit` on the **same** multiplex ([`frame-protocol.smithy`](../../packages/obp/frames/spec/model/frame-protocol.smithy) — exactly two `party_ids`).
2. Genesis `Frame` and subsequent turns follow NBC N1–N9 ([`negotiated-binding-convention.smithy`](../../packages/obp/nbc/spec/model/negotiated-binding-convention.smithy)).
3. Relay stamps `relay_ts_ms` per [`hub-protocol.smithy`](../../packages/obp/frame-relay/spec/model/hub-protocol.smithy) when hub policy applies.

The channel protocol does **not** define turn bodies, bind tallies, or DAG termination — only that a bilateral slot was granted.

---

## Frame spool retention (protocol)

- **While peers connect/disconnect:** relayed opaque bytes append to the per-`channel_id` spool ([`FrameRelayStore`](../../packages/obp/frame-relay/spec/model/store.smithy)); disconnect removes live peers only.
- **Reattach:** `multiplex_attached` replays spool from id `0` (incremental cursors are store-capability, not yet normative on attach).
- **New channel:** `channel_created` clears prior spool for that `channel_id` (new UUID per spawn).
- **Expiry:** `channel_expired` rejects new nonces/attach; spool may persist until explicit delete or operator GC.

---

## Known gaps / deferred

- **Roster wire protocol** — `roster_announce` / `roster_query` above the byte stream (see separation doc §3); not in frame spec today.
- **DAG rejoin descriptor** — reattach to new relay after ephemeral destroy; Vellum contract TBD.
- **Bounded spool** — no normative per-channel byte/frame cap yet.
- **Explicit channel delete** — no `DELETE /v1/channels/:id` in current HTTP surface; expiry-only teardown.
