# Khora relay ID conventions

Canonical reference for stable identifiers in the relay stack. Code constants: [`packages/khora/relay-colonnade/src/relay-id-conventions.ts`](../relay-colonnade/src/relay-id-conventions.ts).

## Scoping keys

| Id | Format | Scope | Example | Stored in |
|----|--------|-------|---------|-----------|
| `tenant_key` | opaque string | catalog + cell routing | `"relay"` | projections, outbox, inbox |
| username-index tenant | fixed constant | **global** usernames | `"relay:username-index-global"` | projections only |

## Tier 1 — catalog projection keys

Primary key: `(tenant_key, namespace, entry_key)`.

| Namespace | `entry_key` | Projection (indexed paths **bold**) |
|-----------|-------------|-------------------------------------|
| `relay:entity:profile` | profile UUID | `{ id, bodyJson, updatedAtMs }` |
| `relay:entity:topic` | topic entity id | `{ id, bodyJson, updatedAtMs }` |
| `relay:reg:by-principal` | principal DID | `{ profileId }` |
| `relay:reg:by-profile` | profile UUID | `{ principalId }` |
| `relay:social:username-to-principal` | normalized username | `{ **principalId** }` |
| `relay:social:principal-to-username` | principal DID | `{ username }` |
| `relay:social:relationship` | channel id | relationship row |
| `at2:room-registry` | room id | `{ **creatorDid**, inviteTargetDid, expiresAtMs }` |
| `at2:room-invite` | SHA-256 hex of join token | invite metadata |

Receive-side subscriptions are percolator standing queries (`standing_queries` on the catalog DB). See receive-intent table in [`colonnade-usage.md`](./colonnade-usage.md).

### Tier 1 — normalized edge tables

| Table | Primary key | Index | Purpose |
|-------|-------------|-------|---------|
| `relay_social_principal_channels` | `(tenant_key, principal_id, channel_id)` | PK covers principal lookup | List channels per principal |

Writes use `INSERT OR IGNORE` / `DELETE` — no JSON array RMW.

## Tier 2 — post + outbox ids

| Id | Format | Notes |
|----|--------|-------|
| **`postId`** | `atp0:` + base64url(JSON `{p,r,n}`) | Encodes `authorPrincipalId`, `recordKey`, `cellPoolCount`. Not a UUID. |
| `record_key` | `ob_{32 hex}` | Colonnade outbox row key; pre-assigned before append |
| `content_hash` | 64 lowercase hex SHA-256 | Verified on inbox drain |
| `authorCellId` | cell pool id | Derived: `derivePoolHomeCell(authorPrincipalId, cellPoolCount)` |

### Encode/decode (`post-address-id.ts`)

```typescript
encodePostId({ authorPrincipalId, recordKey, cellPoolCount }) → string
decodePostId(id) → DecodedPostAddress | undefined  // includes derived authorCellId
```

Invalid ids decode to `undefined`. Post JSON `id` field must match encoded address.

## Tier 3 — cell inbox / delivery

| Id | Format | Notes |
|----|--------|-------|
| `inbox_entry_id` | `ib_{32 hex}` | One row per delivery |
| `correlation_id` | `fan_{32 hex}` | Fan-out internal |
| inbox pointer | `{ source_cell_id, source_record_key, content_hash, cell_pool_count }` | Points at **author** outbox |
| inbox pointer metadata | JSON | `{ postId, authorPrincipalId, reasons, createdAtMs, postKind }` |
| inline staging | JSON bytes + hash | Room tickets |

## Cross-tier ids

| Id | Format |
|----|--------|
| `principalId` | DID (`did:plc:…`) |
| `profileId` | UUID v4 at registration |

### Standing query receive intent

| Intent | Standing query shape | Matches candidates with |
|--------|---------------------|-------------------------|
| Topic | `options.labels.some: ["khora_topic:{slug}"]` | Content + subscription posts tagged with that topic slug |
| Author (all posts) | `namespace: {root}/agents/{profileId}/posts`, `searchScopeMode: "pathSubtree"` | Any post/subscription in that author's posts namespace |
| Author + topic | author namespace + `khora_topic:{slug}` label filter | Author's posts on that topic |
| Subscription posts (publish-side) | N/A | Candidate label kind `khora_subscription` |

Content posts do not create catalog pointers. See [`colonnade-usage.md`](./colonnade-usage.md).
