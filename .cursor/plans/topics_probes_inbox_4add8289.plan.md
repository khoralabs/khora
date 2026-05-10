---
name: Topics probes inbox
overview: Hashtag topics + semantic probes + DID-keyed inbox with WebSocket delivery; notifications retain history with read-on-first-access semantics.
todos:
  - id: notif-union-buffer
    content: Extend AgentNotification; SQLite queue + read_at column; buffer port
    status: pending
  - id: did-profile-schema
    content: host_registrations + topic_subscriptions schema
    status: pending
  - id: ontology-probe-post
    content: Extend zAtriumPost (topics[], kind probe); canonicalOntology probe label
    status: pending
  - id: mapmemory-probes
    content: probeNamespace + mapMemoryOps for probes; memoryNamespaces in Atrium
    status: pending
  - id: fanout-on-event
    content: onEvent topic fan-out + probe search pipeline + enqueue
    status: pending
  - id: http-ws-inbox
    content: WS inbox with connect-time snapshot (recent N rows) + live push; REST optional; mark read on first read
    status: pending
  - id: verify
    content: typecheck, biome, targeted tests
    status: pending
---

# Topics, probes, and inbox (Atrium + swarm)

## Preconditions

- **Inbox and enqueue use DID** ([`AgentNotificationBufferPort`](packages/swarm/host/src/registration/notifications.ts)).
- **Persist `did ↔ profileId`** at [`POST /v1/register`](apps/atrium/host/src/index.ts) for fan-out routing.

## 1. Swarm: extend notification kinds

- In [`packages/swarm/host/src/registration/notifications.ts`](packages/swarm/host/src/registration/notifications.ts), extend **`AgentNotification`** with `topic_post`, `probe_hit` (payload shapes TBD).

## 2. SQLite schema and persistence

Tables:

| Table | Purpose |
|-------|---------|
| **`host_registrations`** | `did` (PK), `profile_id`, `registered_at` |
| **`topic_subscriptions`** | `did`, `topic_slug` — UNIQUE `(did, topic_slug)` |
| **`agent_notifications`** | `id`, `did`, `created_at`, `kind`, `payload_json`, **`read_at_ms`** (NULL = unread) |

**Read semantics (required):**

- Rows **remain** for repeated listing/streaming; clients may fetch the same notification **many times**.
- **`read_at_ms`** is set **the first time** the notification is considered read (exact trigger: first inclusion in a successful **`dequeueBatch`**, first **`GET /v1/inbox`** page that returns it, or first **WebSocket push** delivery—pick **one** consistent rule; recommended: **first server-side “deliver to client”** for that row, e.g. first WS frame sent or first REST read that includes that id).
- After `read_at_ms` is set, subsequent reads still return the row but with **`read: true`** (or `read_at_ms` populated).

Implement **`AgentNotificationBufferPort`**: `enqueue`, **`dequeueBatch`** may either (a) return unread-only and set read, or (b) support **`peek`** without setting read—plan assumes **REST list** returns all with read flags, **dequeue** marks read.

## 3. Registration: store DID mapping

- After successful `registerWithDid`, upsert **`host_registrations`**.

## 4. Data model: posts, topics, probes

- **`topics?: string[]`** on [`zAtriumPost`](apps/atrium/host/src/atrium-post.ts) (normalized slugs).
- **`kind: "post" | "probe"`** with probe-only **`matchPostKinds?: string[]`**.
- **`probeNamespace`** in config + [`memoryNamespaces`](packages/swarm/host/src/host.ts); optional **`probes`** scope in [`memory-search-scope.ts`](packages/swarm/host/src/memory-search-scope.ts).
- Add **`probe`** node label in [`canonicalOntology`](packages/memories/core/src/ontologies/cannonical.ts) (props: owner profile id, optional filter post kinds).

## 5. Memories indexing

- [`mapMemoryOps`](apps/atrium/host/src/create-atrium-host.ts): probes → `probeNamespace` with **`probe`** label + vectors.

## 6. Topic subscribe / publish

- **`POST/DELETE /v1/topics/:slug/subscribe`** with DID.
- Fan-out on **`POST_CREATED`** from `post.topics` → **`topic_subscriptions`** → **`enqueue`**.

## 7. Probe pipeline

- On **`POST_CREATED`** for normal posts: **`ctx.host.search`** against probe namespace with thresholds; **`enqueue`** **`probe_hit`** per mapped DID; dedupe as needed.

## 8. Inbox: WebSocket + read-on-first-read

**Primary transport:** clients **connect to the inbox over WebSocket** (e.g. `GET /v1/inbox/ws` upgrade or Bun route), authenticated with **DID** (query param `did`, header, or subprotocol—document one).

**Behavior:**

- **On WebSocket connect**, the server **must** send an initial **snapshot** of **recent** inbox rows for that DID (e.g. last **N** by `created_at` descending, **N** configurable / env default). Each row includes payload plus **`read`** (from **`read_at_ms`**). This replaces “optional” snapshot: reconnecting clients always get backlog without waiting for new events.
- On **`enqueue`**, **push** new notification frames to connected sessions for that DID.
- **Mark read:** the **first** time a notification is delivered to the client over WS **or** the first time it appears in a **REST read** response that is defined as “consumption,” set **`read_at_ms`** once (idempotent).

**REST (secondary):**

- **`GET /v1/inbox`** — list with pagination; may mark read per query param **`markRead=true`** or separate **`POST /v1/inbox/:id/read`**—choose minimal surface (e.g. list returns rows; **`markRead`** on first list that includes unread ids).

**Out of scope:** push via third-party APNs/FCM; federation.

## 9. Config

- **`probeNamespace`**, **`topicNamespace`**, env defaults.

## 10. Verification

- `tsc`, biome, persistence + WS smoke test if feasible.
