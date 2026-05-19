# Atrium relay ID conventions

Canonical reference for stable identifiers in the relay stack. Code constants: [`packages/atrium/relay-colonnade/src/relay-id-conventions.ts`](../relay-colonnade/src/relay-id-conventions.ts).

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
| `relay:subs:by-principal` | principal DID | `{ subjects: string[] }` |
| `relay:subs:by-subject` | subject string | `{ principals: string[] }` |
| `relay:social:username-to-principal` | normalized username | `{ **principalId** }` |
| `relay:social:principal-to-username` | principal DID | `{ username }` |
| `relay:social:relationship` | channel id | relationship row |
| `relay:social:relationships-by-principal` | principal DID | `{ channelIds: string[] }` |
| `at2:room-registry` | room id | `{ **creatorDid**, inviteTargetDid, expiresAtMs }` |
| `at2:room-invite` | SHA-256 hex of join token | invite metadata |

### Subject subscription strings

| Pattern | Example |
|---------|---------|
| `topic:{slug}` | `topic:rust` |
| `author:{did}` | `author:did:plc:…` |
| `author_topic:{did}\t{slug}` | tab-separated tuple |

## Tier 2 — post + outbox ids

| Id | Format | Notes |
|----|--------|-------|
| **`postId`** | `atp1:` + base64url(JSON `{p,c,r}`) | Encodes `authorPrincipalId`, `authorCellId`, `recordKey`. Not a UUID. |
| `record_key` | `ob_{32 hex}` | Colonnade outbox row key; pre-assigned before append |
| `content_hash` | 64 lowercase hex SHA-256 | Verified on inbox drain |
| `authorCellId` | cell pool id | From `assignPrincipalToCell(did)` |

### Encode/decode (`post-address-id.ts`)

```typescript
encodePostId({ authorPrincipalId, authorCellId, recordKey }) → string
decodePostId(id) → PostAddress | undefined
```

Invalid ids decode to `undefined`. Post JSON `id` field must match encoded address.

## Tier 3 — cell inbox / delivery

| Id | Format | Notes |
|----|--------|-------|
| `inbox_entry_id` | `ib_{32 hex}` | One row per delivery |
| `correlation_id` | `fan_{32 hex}` | Fan-out internal |
| inbox pointer | `{ source_cell_id, source_record_key, content_hash }` | Points at **author** outbox |
| inbox pointer metadata | JSON | `{ postId, authorPrincipalId, reasons, createdAtMs, postKind }` |
| inline staging | JSON bytes + hash | Room tickets |

## Cross-tier ids

| Id | Format |
|----|--------|
| `principalId` | DID (`did:plc:…`) |
| `profileId` | UUID v4 at registration |

## Colonnade catalog ids (unused for Atrium posts)

| Id | Format | When |
|----|--------|------|
| `catalog_pointer_id` | `cptr_{4hex shard}_{32 hex}` | `replicate_to_catalog: true` (not used for posts) |
| `document_key` | `colonnade:publication:{tenant}:{content_hash}` | discovery_documents |
