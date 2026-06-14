# Khora-native agentic apps — research

**Status:** Research stub — not implemented.

## Problem

Khora and relay were designed for agents that run as long-lived processes on user hardware (CLI, daemon, desktop). Building a **web app** that participates on the network without requiring a desktop install implies:

- Custodial agent keys (server-held `did:key`)
- Relay channel join + multiplex attach from a browser session
- Inbox fan-out delivery without a persistent daemon

For Exedra v1 we deliberately **skip relay** and use plain Bun WebSockets until sovereign users exist. This doc captures the open questions for a future “native to Khora” web app pattern that stays low complexity.

## Research questions

### 1. Browser-held DID keys

Can a web app use WebCrypto **non-extractable** Ed25519 keys so users graduate from custodial to sovereign without CLI?

- Pros: same DID across custodial → sovereign cutover
- Cons: key loss on browser data clear; no cross-device sync without export flow

### 2. Inbox without a daemon

Khora inbox today assumes `GET /v1/inbox/ws` with DID-signed URL params — a persistent connection or polling daemon.

- Can SSE or short-lived signed polls replace the daemon for web?
- What is the minimal server-side bridge (Exedra proxies inbox → browser SSE)?

### 3. Custodial → sovereign handoff

What is the UX for exporting a custodial identity without `khora link` CLI?

- Encrypted key export + OTP verification?
- Registry-mediated key rotation with grace period?

### 4. Relay attach from browser

Relay join requires DID-signed HTTP (`POST /v1/channels/join`) and WS upgrade with nonce.

- Can Exedra backend proxy relay frames while user stays on session cookie auth (v3)?
- When does direct browser→relay attach become worth the complexity (v4)?

### 5. Session invites vs channel invites

| Mechanism | Gates |
|---|---|
| Exedra `session_invites` | Web bootstrap + registry OTP |
| Relay `channel_invites` | Channel roster membership |
| Khora host `khora_invite_tokens` | Host agent registration |

Exedra session access in Khora-native mode likely uses **relay channel join tokens** delivered via **Khora inbox posts**, not Exedra deep links alone.

## Success criteria

A “Khora-native web app” pattern is solved when:

1. A facilitator can invite a stakeholder who only uses a browser
2. Stakeholder gets a stable `did:key` and personal memories namespace
3. Interview/alignment transport can upgrade to relay without re-keying or history migration
4. Optional sovereign graduation path exists without CLI

## References

- [Exedra architecture — adoption path](../product/exedra/architecture.md)
- [Khora / Vellum separation](../../technical/khora-vellum-separation.md)
- [Channel lifecycle](../../technical/channel-lifecycle.md)
- [Custodial vs sovereign agents](../../technical/security.md)
