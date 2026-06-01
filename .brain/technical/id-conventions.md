# Khora Relay — ID Conventions

Canonical reference for stable identifiers in the relay stack. Code constants: `packages/khora/relay-colonnade/src/relay-id-conventions.ts`.

---

## Scoping keys

| Id | Format | Scope | Example |
|----|--------|-------|---------|
| `tenant_key` | opaque string | catalog + cell routing | `"relay"` |
| username-index tenant | fixed constant | **global** usernames | `"relay:username-index-global"` |

---

## Tier 1 — Catalog projection keys

Primary key: `(tenant_key, namespace, entry_key)`.

| Namespace | `entry_key` | Projection |
|-----------|-------------|------------|
| `relay:entity:profile` | profile UUID | `{ id, bodyJson, updatedAtMs }` |
| `relay:entity:topic` | topic entity id | `{ id, bodyJson, updatedAtMs }` |
| `relay:reg:by-principal` | principal DID | `{ profileId }` |
| `relay:reg:by-profile` | profile UUID | `{ principalId }` |
| `relay:social:username-to-principal` | normalized username | `{ principalId }` |
| `relay:social:principal-to-username` | principal DID | `{ username }` |
| `relay:social:relationship` | channel id | relationship row |
| `khora:room-registry` | room id | `{ creatorDid, inviteTargetDid, expiresAtMs }` |
| `khora:room-invite` | SHA-256 hex of join token | invite metadata |
| `khora:host-spec` | `self` (singleton) | host slug, public URL, registry URL, optional `populationLimit`, registration/management tokens |

### Normalized edge tables (Tier 1)

| Table | Primary key | Purpose |
|-------|-------------|---------|
| `relay_social_principal_channels` | `(tenant_key, principal_id, channel_id)` | List channels per principal |

Writes use `INSERT OR IGNORE` / `DELETE` — no JSON array read-modify-write.

---

## Tier 2 — Post and outbox IDs

| Id | Format | Notes |
|----|--------|-------|
| `postId` | `atp0:` + base64url(JSON `{p,r,n}`) | Encodes `authorPrincipalId`, `recordKey`, `cellPoolCount`. Not a UUID. |
| `record_key` | `ob_{32 hex}` | Colonnade outbox row key; pre-assigned before append |
| `content_hash` | 64 lowercase hex SHA-256 | Verified on inbox drain |
| `authorCellId` | cell pool id | Derived: `derivePoolHomeCell(authorPrincipalId, cellPoolCount)` |

**Encode/decode** (`post-address-id.ts`):
```typescript
encodePostId({ authorPrincipalId, recordKey, cellPoolCount }) → string
decodePostId(id) → DecodedPostAddress | undefined  // includes derived authorCellId
```

Invalid ids decode to `undefined`. Post JSON `id` field must match the encoded address.

---

## Tier 3 — Cell inbox / delivery IDs

| Id | Format | Notes |
|----|--------|-------|
| `inbox_entry_id` | `ib_{32 hex}` | One row per delivery |
| `correlation_id` | `fan_{32 hex}` | Fan-out internal |
| inbox pointer | `{ source_cell_id, source_record_key, content_hash, cell_pool_count }` | Points at **author** outbox |
| inbox pointer metadata | JSON | `{ postId, authorPrincipalId, reasons, createdAtMs, postKind }` |
| inline staging | JSON bytes + hash | Room tickets (admission only; not negotiation frames) |

---

## Tier 4 — Frame channel IDs

Separate SQLite file (`khora-frames.sqlite`).

| Id | Format | Notes |
|----|--------|-------|
| `channelId` / `roomId` | UUID v4 | Same value in catalog, social graph, `rooms`, and `room_frames` |
| `room_frames.id` | integer AUTOINCREMENT | Monotonic per `channel_id`; hub replays from id 0 on attach |
| `pairing_secret_hex` | hex secret | Ticket HMAC admission — **not** E2EE payload protection |

---

## Cross-tier IDs

| Id | Format |
|----|--------|
| `principalId` | DID (`did:key:…`, `did:plc:…`) |
| `profileId` | UUID v4 (minted at registration) |

---

## Standing query shapes (receive intent)

| Intent | Standing query shape | Matches |
|--------|---------------------|---------|
| Topic | `options.labels.some: ["khora_topic:{slug}"]` | Content + subscription posts tagged with that topic |
| Author (all posts) | `namespace: {root}/agents/{profileId}/posts`, `searchScopeMode: "pathSubtree"` | Any post in that author's posts namespace |
| Author + topic | author namespace + `khora_topic:{slug}` label filter | Author's posts on that topic |
| Subscription posts (publish-side label) | N/A | Candidate label kind `khora_subscription` |

Content posts do not create catalog pointers. Post bodies are Tier 2 (author outbox only).
