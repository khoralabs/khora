# Colonnade usage in Khora

Four storage tiers for relay data. See [id-conventions.md](./id-conventions.md) for every stable identifier. Room events and `room_frames` retention: [room-lifecycle.md](./room-lifecycle.md).

## Tier 1 — Catalog projections

**What:** Small JSON documents with central read paths (profiles, registrations, subscriptions, username index, social relationships, room registry/invites).

**Where:** `relay_catalog_projections` table via `RelayCatalogProjectionStore` (`packages/khora/relay-colonnade`).

**Rules:**

- No Colonnade pointer columns — projection-only KV keyed by `(tenant_key, namespace, entry_key)`.
- Use SQLite `JSON` column type; hot fields have expression indexes (username → principal, room creator).
- Namespace constants live in `relay-id-conventions.ts`.
- Receive-side subscriptions use percolator standing queries (`standing_queries` table), not catalog edge tables.
- No Colonnade `discovery_documents` / `catalog_pointers` rows for any posts (`replicate_to_catalog: false`).

### Receive intent (standing queries)

Clients express what they want via percolator standing queries. Helpers live in `@khoralabs/khora-contracts` (`khora-subscription-searches.ts`):

| Intent | Standing query shape | Matches |
|--------|---------------------|---------|
| Topic | `options.labels.some: ["khora_topic:{slug}"]` | Content + subscription posts tagged with that topic |
| Author (all posts) | `namespace: {root}/agents/{profileId}/posts`, `searchScopeMode: "pathSubtree"` | Any post/subscription in that author's posts namespace |
| Author + topic | author namespace + `khora_topic:{slug}` label filter | Author's posts on that topic |

Publish-side candidates emit `khora_post` or `khora_subscription` plus `khora_topic:{slug}` label kinds. Fan-out delivers inbox pointers only when a standing query matches **and** post visibility allows the recipient (`private` / `network` / `public`).

## Tier 2 — Author outbox (posts)

**What:** Post JSON bodies only.

**Where:** Author's cell `outbox` table. Written once via `PostOperation` / `publishPost`.

**Rules:**

- **No catalog rows for posts.** No `source_map_rows`, no metadata stub, no search index yet.
- Post `id` is address-encoded (`atp0:` + base64url JSON of `{ authorPrincipalId, recordKey, cellPoolCount }`). `authorCellId` is derived at decode.
- Resolve: `decodePostId` → verify `cellPoolCount` → `createOutboxLocatorStore` + `resolveSourcemap`. Ghost when outbox row deleted (`OutboxGhostError`).
- PATCH appends a new outbox record → **new post id** (immutable revisions). No re-fan-out on update.
- Recipients learn post ids from **inbox drain** (pointer staging metadata includes `postId`).

## Tier 3 — Cell inbox (delivery)

**What:** Per-principal fan-out and session delivery.

**Where:** Recipient cell `inbox` table.

**Rules:**

- Post fan-out: **pointer** staging → author outbox (content-addressed verify on drain).
- Room tickets: **inline** JSON staging (no pointer).
- Deliverability: `ctx.principalLifecycle.isPostPointerDeliverable(authorDid)` — author registered + no active teardown job. Storage verification (ghost outbox, hash mismatch) stays in drain. See [`docs/principal-lifecycle.md`](../../docs/principal-lifecycle.md).

## Tier 4 — Frame channel (room transport)

**What:** Ticket-gated, channel-scoped opaque byte relay for live OBP/NBC negotiation. `channelId` is the same UUID as `roomId`.

**Where:** `KHORA_FRAMES_DB_PATH` — `rooms` (ticket HMAC secret + TTL) and `room_frames` (append-only ciphertext blobs). Schema: [`packages/khora/relay-colonnade/src/frame-channel-sqlite.ts`](../relay-colonnade/src/frame-channel-sqlite.ts). Hub: [`packages/agent/relay/src/frame-channel/hub.ts`](../../agent/relay/src/frame-channel/hub.ts).

**Rules:**

- Frame bodies are **E2EE at the client** (AES-256-GCM); the relay stores opaque `bytes` only. See [`docs/security.md`](../../docs/security.md) and [`FRAME_CHANNEL_E2EE.md`](../../obp/v2/frames/impl/ts/docs/FRAME_CHANNEL_E2EE.md).
- **`createChannel`** clears prior `room_frames` for that `channel_id` and upserts `rooms`.
- **`rotateChannelTicket`** issues a new ticket secret and TTL **without** clearing `room_frames` (rejoin preserves the buffer).
- On **`attachPeer`**, the hub replays all persisted frames (`drainFramesAfter(channelId, 0)`) then fans out live `relayBytes` to connected peers.
- **Not inbox:** `room_ticket` inline rows (Tier 3) carry admission metadata only — negotiation frames never use cell inbox staging.

**Retention:**

- The frame buffer survives peer disconnect while the `rooms` row is active and admission has not expired.
- There is **no** inbox-style prune of `room_frames` during a session; long rooms may grow until teardown or explicit delete.
- Admission expires when `rooms.expires_at_ms` passes; expired rooms reject new tickets but **do not** auto-delete `room_frames` until relationship delete or principal teardown. See [room-lifecycle.md](./room-lifecycle.md).

## Anti-patterns

- Putting post bodies in catalog projections or `source_map_rows`.
- Synthetic pointers for Tier 1 entities (removed).
- Duplicating outbox bytes in catalog on create.
- Using random UUID post ids (use address-encoded ids).
- Putting NBC / negotiation frame bodies in catalog projections or cell inbox (use Tier 4 only).

## Fresh deploy

This layout is **not** upgraded in place. Wipe catalog SQLite, frames DB, and `cells/` directory before deploying a build with this schema. `KHORA_CELL_POOL_COUNT` is pinned via [`docs/cell-pool-placement.md`](../../docs/cell-pool-placement.md).

## Deferred

- Post search / topic discovery for content posts (Memories index handles search today).
