# Khora / Vellum Separation & Negotiation Platform Roadmap

Strategic intent and engineering pathway for treating **Khora** and **Vellum** as separate products, generalizing **channel auth**, and evolving the **room multiplex** toward N participants and late joins — while keeping **NBC chains strictly bilateral**.

Related: [`product/khora.md`](../product/khora.md), [`product/vellum.md`](../product/vellum.md), [`technical/discovery.md`](discovery.md), [`technical/vellum-channels.md`](vellum-channels.md), [`packages/vellum/spec/channel-relay-deployment.md`](../../packages/vellum/spec/channel-relay-deployment.md), [`technical/channel-lifecycle.md`](channel-lifecycle.md), [`packages/vellum/spec/channel-control-protocol.md`](../../packages/vellum/spec/channel-control-protocol.md), [`technical/room-lifecycle.md`](room-lifecycle.md), [`technical/obp-protocol.md`](obp-protocol.md), [`technical/host.md`](host.md), [`roadmap/open-questions.md`](../roadmap/open-questions.md).

---

## Summary

| Concern | Today | Target |
|---------|-------|--------|
| **Product boundary** | Khora host owns discovery *and* room registry, frame relay, `room_ticket` inbox delivery | Khora = discovery only; Vellum = spawn/allocate ephemeral negotiation rooms |
| **Channel auth** | Khora DID-key HTTP auth; frame relay ticket HMAC; `SessionInit` fixes two Ed25519 actors | Pluggable principal credentials (DID, OAuth/OIDC, registry session, client credentials) at channel/chain admission |
| **Room vs chain** | One Khora `roomId` ≈ one bilateral NBC session; both peers known at `init` | Room multiplex carries **N** transport participants with **late join**; each NBC **chain** remains **two signers** |

---

## 1. Khora as discovery; Vellum as ephemeral room product

### Intent

**Khora** is the intent-based discovery fabric: standing queries, percolator fan-out, inbox delivery, search, profiles, and social visibility. Its job ends when an agent (or human principal) has enough signal to decide *whether* to negotiate and *with whom*.

**Vellum** is the negotiation-room product: spawn and allocate **ephemeral** transport runtimes (frame relay + admission) where parties run **local OBP/NBC daemons**. The relay holds opaque bytes and tickets; negotiation semantics and DAG state live on participants' devices. A relay instance may be destroyed and recreated; an **equivalent bilateral DAG** (same `genesis_hash`, matching Merkle checkpoint, participant actor keys) is the cryptographic join key — not the Khora catalog.

These are **separate products** with a thin integration contract, not one monolithic host.

### Why separate

1. **Different scaling profiles** — discovery (percolator, search, millions of subscribers) vs negotiation (low-volume, latency-sensitive, E2EE byte relay).
2. **Different trust posture** — Khora operator sees public/social data; Vellum relay must not see NBC semantics (already true for frame bodies; separation makes it architectural, not incidental).
3. **Different deployment** — discovery host is long-lived catalog + cells; negotiation relay can be **ephemeral** (Fly.io, Modal, per-session isolate) with no Colonnade dependency.
4. **Different customers** — enterprise may buy Vellum room infrastructure without running a public Khora discovery node, and vice versa.

### Current coupling (what blurs the boundary)

| Coupling point | Location | Problem |
|----------------|----------|---------|
| Room HTTP API | `POST /v1/rooms`, join, ticket, delete on Khora host | "Open a negotiation" is a Khora feature |
| Frame relay store | `khora-frames.sqlite` bootstrapped with catalog in `createRelayColonnadeSocial` | Relay lifecycle tied to host disk |
| Inbox `room_ticket` | `deliverRoomTicketToPrincipal` pushes WS URL + ticket | Discovery host mediates negotiation handoff |
| Social relationship rows | Created on room create; visibility tied to `channel_id` | "Connection" ≡ frame channel on Khora |
| Vellum CLI room commands | `vellum room create` → `KhoraClient.createRoom()` | Vellum product depends on Khora server |
| `webSocketUrl` | Always `wss://<khora-host>/v1/rooms/:id/ws` | No external relay endpoint |

### Target architecture

```mermaid
flowchart TB
  subgraph khora [Khora — discovery]
    Sub[Standing queries / percolator]
    Inbox[Inbox notifications]
    Search[Search + profiles]
    Intro["negotiation_invite (peer principal, match context)"]
  end

  subgraph vellum [Vellum — negotiation rooms]
    Spawn[POST /v1/rooms spawn]
    Relay[Ephemeral frame relay]
    Admit[Channel admission + tickets]
  end

  subgraph local [Participant-local]
    Daemon[Vellum daemon + OBP SQLite]
  end

  Sub --> Intro
  Intro --> Spawn
  Spawn --> Relay
  Daemon <-->|multiplex WS| Relay
```

**Khora emits intent and identity references** (DID, OAuth `sub` URI, match metadata). It does **not** mint frame tickets or host negotiation WebSockets.

**Vellum spawns rooms**: provisions `channel_id`, pairing secret, relay URL (possibly ephemeral infrastructure), TTL, and optional invite tokens. Participants connect daemons to that URL.

**Frame relay** implements `@khoralabs/obp-frame-relay` only — `rooms` + `room_frames`. No catalog projections, no cell shards, no percolator.

### Integration contract (Khora → Vellum)

Minimal cross-product notification (replaces or supplements `room_ticket`):

```json
{
  "kind": "negotiation_invite",
  "peerPrincipal": "did:key:z6Mk…",
  "matchRef": { "subscriptionId": "…", "postId": "…" },
  "suggestedTopic": "…",
  "vellumSpawnHint": null
}
```

- **No** `webSocketUrl`, **no** pairing secret on Khora.
- Optional: peer or initiator includes a Vellum `roomId` after spawn (second notification or pull).
- Principal URIs are scheme-agnostic (`did:…`, `urn:oidc:sub:…`) so OAuth-backed users can appear in discovery without a Khora DID.

### Pathway (phased)

| Phase | Outcome | Stack changes |
|-------|---------|---------------|
| **P0 — Document & ports** | Frame relay deployable without Khora catalog | Already true at package level (`@khoralabs/obp-frame-relay`); document Vellum-owned deployment |
| **P1 — Vellum channel-relay** | One **container per channel**: OBP multiplex + policy enforcement (roster cap, chain slots); join = OOB single-use token | **In progress** — pool reference app done (slice 2); canonical deployment per [`channel-relay-deployment.md`](../../packages/vellum/spec/channel-relay-deployment.md) |
| **P2 — Vellum client cutover** | `POST /v1/channels` + join/allocate APIs; `VellumChannelClient` | **Done (slice 2)** — admission modes, chain limits, CLI `channel *`, `vellum/channels/` |
| **P3 — Khora handoff** | Inbox `negotiation_invite`; deprecate Khora `room_ticket` for new flows | `@khoralabs/khora-contracts` notification kind; discovery docs updated |
| **P4 — Decouple social graph** | `network` visibility independent of frame channel existence | Relationship model not created by room spawn; optional explicit `connection_request` flow |
| **P5 — Ephemeral infra** | Relay on Fly/Modal per room or pool; destroy OK; rejoin via DAG descriptor | Orchestrator in Vellum spawn; see §3 rejoin |
| **P6 — Retire Khora room surface** | Remove room HTTP/WS from Khora host (breaking) | `bootstrap-khora.ts` drops `frameRelayStore`; `room-lifecycle.md` split |

### DAG as join key (relay disposable)

When an ephemeral relay is destroyed:

1. Each party retains local `state.sqlite` (full OBP projection + `vellum_chains` metadata).
2. Rejoin descriptor (Vellum contract, not yet implemented): `{ session_id, genesis_hash, checkpoint: { seq, root_hex }, parties: [{ party_id, actor_pubkey }] }`.
3. New relay instance: new admission ticket, same or new `channel_id`; peers attach and either replay from spool **or** sync via `SessionEnvelope` / exported persistence if spool empty.
4. Parties verify they are listed actors and that recomputed Merkle root matches.
5. **Admission:** Presenting the DAG descriptor (or knowing `genesis_hash`) is **not** sufficient for relay attach — the **principal** must authenticate and the product layer must verify that principal maps to one of the chain parties. See [`dag-join-key-research.md`](dag-join-key-research.md).

Longer-term research: late join via **peer-verified DAG export** rather than relay history; optional global dedup of transport around the same logical chain. Details in [`dag-join-key-research.md`](dag-join-key-research.md).

Khora is not involved in rejoin.

---

## 2. Auth strategies for channel and chain permissioning

### Intent

**Principal authentication** (who is allowed to act on behalf of a human/org) and **negotiation actor authentication** (who signs NBC frames) are different layers. DID-key auth is one principal strategy, not the only one. Traditional OAuth/OIDC flows (authorization code + PKCE, device code, client credentials, registry session cookies) should permission **channel admission** and **chain participation** without replacing per-frame Ed25519 signatures.

Rule: **OAuth at the edges; cryptographic actors on the wire.**

| Layer | Proves | Examples today | Target strategies |
|-------|--------|----------------|-------------------|
| **Principal** | Network/human identity | `did:key` HTTP signatures; registry Better Auth OTP | DID, OAuth OIDC JWT, registry session, API key, mTLS client cert |
| **Channel admission** | Right to attach to relay byte stream | Ticket HMAC (`pairing_secret_hex`) | Ticket + optional principal binding; bearer token at WS upgrade |
| **Chain actor** | Right to append to a bilateral frame DAG | Ed25519 `Frame.actor` + `sig` in `SessionInit` | Ed25519 (retained); optional delegated actor lease attested by principal |

OBP `Party { id, name }` remains graph-local and opaque. `SessionInit.party_ids` are not DIDs — mapping principal → party → actor is application policy.

### Current building blocks

- **Khora `AuthStrategy`** — pluggable HTTP verification (`packages/khora/auth/src/strategy.ts`); default DID-key only.
- **Registry dual plane** — Better Auth for humans; agent DID for host; `auth_links` / `khora link` bridge (see [`technical/onboarding-flow.md`](onboarding-flow.md)).
- **Frame relay tickets** — HMAC admission, no principal identity (`@khoralabs/duplex-byte-stream`).
- **`SessionInit`** — exactly two `actor_pubkeys`; both must be known at bootstrap (bilateral v2).
- **Vellum daemon** — loads Ed25519 identity file → `FrameSigner`; local control HTTP is localhost-trust.

### Target model

```mermaid
flowchart LR
  subgraph principal [Principal credential]
    DID[DID-key]
    OAuth[OAuth / OIDC]
    Reg[Registry session]
  end

  subgraph vellumId [Vellum admission service]
    Verify[Verify principal]
    Lease[Issue actor lease / ticket]
  end

  subgraph wire [NBC wire]
    Init[SessionInit]
    Frames[Signed frames]
  end

  DID --> Verify
  OAuth --> Verify
  Reg --> Verify
  Verify --> Lease
  Lease --> Init
  Init --> Frames
```

**Channel permissioning**: Vellum relay validates principal at spawn and/or WS upgrade (`Authorization: Bearer`, DID signature headers, or ticket bound to principal claim).

**Chain permissioning**: Before `chain/init`, Vellum control plane checks principal is allowed on this `roomId`; returns or confirms `actor_pubkey` for `SessionInit`. Peer pubkey may be learned via room **roster** (§3), not required at Khora discovery time.

**Actor lease** (recommended for OAuth): short-lived Ed25519 keypair minted after OAuth success, stored in daemon secure storage, mapped to `principal_sub` in `vellum_chains` metadata. NBC frames still Ed25519; OAuth never becomes `Frame.actor`.

### Pathway (phased)

| Phase | Outcome | Changes |
|-------|---------|---------|
| **A0 — Identity provider interface** | `VellumIdentityProvider` in `@khoralabs/vellum-client`: `did-file \| oauth-pkce \| registry-session` | New contracts package types |
| **A1 — Khora `BearerAuthStrategy`** | Optional OAuth JWT on Khora HTTP (discovery APIs only) | `packages/khora/auth` |
| **A2 — Relay WS auth** | Vellum relay: validate bearer or DID sig on upgrade; bind ticket to principal | `apps/vellum/relay-server` |
| **A3 — Actor lease service** | POST `/v1/actor-lease` after principal auth → ephemeral pubkey + expiry | Vellum relay or sidecar |
| **A4 — Chain admission policy** | Daemon refuses `chain/init` unless principal authorized for room; peer pubkey from roster | `apps/vellum/daemon` control server |
| **A5 — Document principal URIs** | `negotiation_invite.peerPrincipal` as URI (`did:`, `urn:oidc:sub:`) | Contracts + discovery doc |

### Non-goals

- Using OAuth access tokens as `Frame.actor` values.
- Replacing Ed25519 frame signatures with JWT for NBC commits (binds require cryptographic non-repudiation).
- Requiring every participant to have a Khora-registered DID.

---

## 3. N-party room multiplex, late join, bilateral NBC chains

### Intent

Generalize the **transport room** (one duplex multiplex on a frame relay) to support:

- **N participants** attached to the same `channel_id` over time
- **Late join** — connect after negotiation started; receive relay spool replay + roster
- **Multiple bilateral NBC chains** on the same byte stream (already supported via multiplex `init` envelopes)

Keep **NBC chains strictly bilateral**: each `session_id` / `genesis_hash` chain has exactly **two** frame signers. Multi-party *scenarios* are modeled as a **mesh of bilateral chains** and/or a shared room roster — not as N signers on one NBC chain.

**OBP persistence** can represent many `Party` nodes in one store; **NBC v2 wire** and bind rules remain pairwise per chain. Extending to N signers on a single causal log is a **research fork** (see [`roadmap/open-questions.md`](../roadmap/open-questions.md)); it is explicitly **out of scope** for this pathway.

### Problem with today's assumption

`SessionInit` requires `party_ids[2]` and `actor_pubkeys[2]` known at bootstrap, with `templateMatch` enforcing both pubkeys across multiplex chains on a stream. Vellum `chainCreate` requires `peerActorPubkeyHex` upfront. That fits closed dyads; it does not fit:

- Open RFQ (counterparty unknown at spawn)
- Khora match → negotiate (DID known, actor pubkey not)
- Consortium / auction (N > 2) without N bilateral sessions pre-planned

### Conceptual split

| Object | Cardinality | Purpose |
|--------|-------------|---------|
| **Room** (`channel_id`) | N transport peers | Shared byte relay, spool replay, roster, admission |
| **Roster entry** | N principals / actors | Who is connected or entitled to connect |
| **NBC chain** | Exactly 2 signers | One causal DAG, one Merkle log, pairwise binds |
| **OBP graph** (per daemon) | Many parties/offers/ports | Local projection; may aggregate multiple chains |

```mermaid
flowchart TB
  subgraph room [Room channel_id — N transport peers]
    P1[Peer A]
    P2[Peer B]
    P3[Peer C late join]
    Relay[Frame relay spool]
  end

  subgraph chains [Bilateral NBC chains on same multiplex]
    C1["Chain 1: A ↔ B"]
    C2["Chain 2: A ↔ C"]
    C3["Chain 3: B ↔ C"]
  end

  P1 & P2 & P3 <--> Relay
  P1 & P2 -.-> C1
  P1 & P3 -.-> C2
  P2 & P3 -.-> C3
```

### Late join behavior (target)

1. Principal authenticates to Vellum relay (§2).
2. Relay admits peer to existing `channel_id`; **replay** `room_frames` from cursor (wire `drainFramesAfter` — API exists, not fully wired on attach).
3. Roster broadcast (new wire message or side channel): `{ principal, actor_pubkey, joined_at_ms }`.
4. Participant chooses counterparty from roster; calls `chain/init` with that peer's `actor_pubkey` (local daemon or control API).
5. New bilateral `SessionInit` on the **same multiplex** (distinct `session_id` / `genesis_hash`).
6. If relay spool missed frames, peer syncs via `SessionEnvelope` checkpoint exchange from local SQLite.

Unknown counterparty at room spawn is OK; unknown counterparty at **chain** bootstrap is not (bilateral v2 unchanged).

### Roster & pre-session protocol (new)

Frame spec does not define roster or deferred peer discovery. Vellum adds a **room-scoped** protocol (plaintext or E2EE) above relay bytes:

| Message | Purpose |
|---------|---------|
| `roster_announce` | Principal + `actor_pubkey` on join |
| `roster_query` | Late joiner requests current roster |
| `chain_proposal` | Optional intent to open bilateral chain with specific peer |

These are **not** NBC `TURN` bodies — they are multiplex control plane for the room product.

### Pathway (phased)

| Phase | Outcome | Changes |
|-------|---------|---------|
| **M0 — N attach relay** | Hub allows >2 peers per `channel_id`; fan-out to all attached peers | `@khoralabs/obp-frame-relay` hub (verify current behavior; extend if capped at 2) |
| **M1 — Roster wire format** | Smithy + TS types in `@khoralabs/vellum-contracts` | New spec namespace `khora.vellum.room` |
| **M2 — Daemon roster** | On WS connect, announce self; persist roster in room metadata SQLite | `run-vellum-daemon.ts` |
| **M3 — Late join replay cursor** | Attach replays from `last_frame_id` or full spool; document cursor handshake | Relay attach + client |
| **M4 — Deferred chain create** | `chainCreate` accepts peer from roster lookup by principal URI | `VellumClient` |
| **M5 — Mesh orchestration** | Optional helper: spawn K bilateral chains for K peers (consortium pattern) | Vellum CLI / library |
| **M6 — Open RFQ flow** | Single room, multiple responders, each opens separate A↔responder chain | Product flow on top of M2–M5 |

### OBP N-signer chain (explicitly deferred)

The frame layer *could* be generalized to N `actor_pubkeys` with N-way causal consistency. NBC bind rules, `END_OFFERS`, Merkle session sync, and turn semantics assume bilateral sessions today. A multi-signer causal log requires a separate spec revision (`OBP/2.0` or `khora.obp.frame.multiparty`). **Do not** stretch `party_ids` to N in v2 NBC; use mesh of bilateral chains instead.

---

## Cross-cutting dependencies

```mermaid
flowchart LR
  P1[P1 Vellum relay server]
  P2[P2 Vellum spawn API]
  A2[A2 Relay WS auth]
  M1[M1 Room roster wire]
  P3[P3 negotiation_invite]

  P1 --> P2
  P2 --> A2
  P2 --> M1
  P3 --> P2
  A2 --> M1
```

Recommended order: **P1 → P2 → A2 → M1 → M2 → P3** (infra and auth before Khora notification cutover).

---

## Success criteria

- [ ] Vellum relay runs with zero Khora catalog/cell dependencies
- [ ] `vellum room create` targets Vellum base URL, not Khora host
- [ ] Khora inbox can deliver `negotiation_invite` without WS URL or pairing secret
- [ ] At least two principal auth strategies work for Vellum room spawn (DID + OAuth or registry session)
- [ ] Room supports ≥3 simultaneous WS peers on one `channel_id`
- [ ] Late joiner receives spool replay and roster; can open new bilateral chain without prior knowledge of peer pubkey at room spawn
- [ ] Ephemeral relay destroy + DAG-descriptor rejoin documented and demonstrated
- [ ] NBC v2 bilateral `SessionInit` unchanged; no N-signer chain in production path

---

## References (code today)

| Area | Package / path |
|------|----------------|
| Frame relay hub | `packages/obp/frame-relay/impl/ts/src/hub.ts` |
| Frame relay store port | `packages/obp/frame-relay/impl/ts/src/store-types.ts` |
| Khora room HTTP | `apps/khora/server/src/http/rooms.ts` |
| Room admission + inbox ticket | `packages/khora/host/src/room-admission.ts` |
| Colonnade + frame store bootstrap | `packages/khora/relay-colonnade/` |
| Bilateral `SessionInit` | `packages/obp/frames/spec/model/frame-protocol.smithy` |
| Multiplex runtime | `packages/obp/frames/impl/ts/src/frame-multiplex-runtime.ts` |
| Vellum chain create | `packages/vellum/client/src/vellum-client.ts` |
| Pluggable Khora HTTP auth | `packages/khora/auth/src/strategy.ts` |

---

*Last updated: June 2026*
