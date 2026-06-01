# Percolator — Design and Unification

## Current state

There are three separate fan-out mechanisms in the codebase, only one of which runs through the percolator:

```
POST/DELETE /v1/topics/:slug/subscribe
POST/DELETE /v1/authors/.../subscribe
  → relay_subscription_edges (principal_id, subject)   [edge table, bypasses percolator]

POST /v1/posts (kind: "post" | "status" | "subscription")
  → AgentRelay.notify(POST_CREATED)
  → publishPost → subscriberPrincipalsForSubject (topic/author/author_topic edge lookup)
  → Colonnade inbox pointer staging
```

`kind: "probe"` has been consolidated into `kind: "subscription"`. Subscriptions of any kind are created via the CLI `subscriptions` commands. The legacy `addProbeHitReasons` / `probe-hit` path is the next thing to remove (Phase 2 below). The remaining problem is that fan-out still runs through the edge table rather than the percolator — content posts don't trigger reverse standing-query lookup.

---

## The unifying insight

All subscription types are the same thing at layer 1:

> "I want to receive posts related to this marker."

| Marker type | Today | Unified as `StandingSearchRequest` |
|-------------|-------|-------------------------------------|
| Topic tag | `topic:rust` edge + post `topics: ["rust"]` | Filter-only: `options.labels.some: ["khora_topic:rust"]` |
| Author follow | `author:{did}` edge | `namespace = author's post scope` or label `author:{did}` |
| Semantic subscription | `kind: "subscription"` + `search` | `content.text` + optional filters |
| CLI create kinds | `khora subscriptions create` | `topic`, `author`, `author-topic` (exact/filter-only); `semantic` (`--search-text`) |

Layer 2 is orthogonal: **should the act of subscribing itself be visible / fanned out?** That maps cleanly to **post visibility**, not to the marker semantics.

---

## Target architecture

```
Subscription / marker post:
  POST /v1/posts (kind: subscription, search + visibility)
    → Author outbox
    → percolator.registerQuery (id = post.id, owner = author)
    → if visibility=public/network: publishPost fan_out_targets (announce subscription)
    → if visibility=public: replicate_to_catalog (discovery projection)

Content post:
  POST /v1/posts (kind: post | status)
    → Author outbox
    → memories indexer
    → percolator.evaluateCandidate
    → PercolatorMatch[]
    → fan_out_targets (reason: standing_query)
```

One delivery rail (Colonnade inbox pointers), one matching engine (percolator), posts as the source of truth.

---

## Integration plan (phased)

### Phase 0 — Align contracts ✓ done

1. ~~Add post kind `subscription` (rename `probe` → `subscription`)~~ — done; `kind: "probe"` removed
2. `search: StandingSearchRequest` replaces `attributes`
3. `visibility: "public" | "network" | "private"` on all post kinds
4. `InboxPostReason` extended with `{ kind: "standing_query"; queryPostId: string; score: number }` (replaces `probe-hit`)
5. Legacy `topics` on content posts retained for authoring/tagging; matching uses labels derived at index time

### Phase 1 — Bootstrap percolator in host

1. Add `@khoralabs/percolator-sqlite` to catalog DB (subscription routing is host-global; not memories-dependent)
2. Create `createKhoraPercolatorHost()` in `packages/khora/host`:
   - wraps `createPercolator` + sqlite persistence
   - `embedText` from existing memories embedding model
3. Wire into `bootstrap-khora.ts` alongside memories

### Phase 2 — Correct matching direction (replace probe-hit)

In `createKhoraRelayOnEvent`, on `POST_CREATED` for content posts (`post`, `status`):

1. Build `PercolatorCandidate` from indexed post metadata:
   - `candidateId` = post.id, `authorId` = author principal
   - `namespace` = posts memory namespace
   - `labelKinds` = derived from topics + kind labels
   - `content` = lexical text + vector
2. `matches = await percolator.evaluateCandidate(candidate)`
3. For each match: `addReason(match.ownerId, { kind: "standing_query", queryPostId, score })`
4. **Remove** topic/author edge lookup from content fan-out (or keep behind a flag)
5. Delete `addProbeHitReasons` / `probe-hit.ts` and topic-based legacy fan-out

Also evaluate on `PROFILE_UPDATED` for semantic profile matching.

### Phase 3 — Subscriptions as posts

1. `POST /v1/posts` with `kind: "subscription"` becomes the primary API
2. On `POST_CREATED` for subscriptions:
   - `percolator.registerQuery({ id: post.id, ownerId, search, minScore, expiresAtMs })`
   - If `visibility !== "private"`: self-fan-out via `publishPost` with reason `{ kind: "subscription_announcement" }`
   - If `visibility === "public"`: `replicate_to_catalog: true` with discovery envelope
3. On `POST_DELETED` / expiry: `percolator.deactivateQuery` / `deleteQuery`
4. Migrate HTTP subscribe endpoints to create subscription posts internally (compat shim), then deprecate

### Phase 4 — Unify exact tags into percolator

Map today's edge subjects to filter-only queries:

```ts
// topic:climate-tech
{ content: {}, options: { labels: { some: ["khora_topic:climate-tech"] } } }

// author:did:key:...
{ namespace: postsNsForAuthor, content: {}, searchScopeMode: "pathSubtree" }

// author_topic tuple
{ namespace: postsNsForAuthor, content: {}, options: { labels: { some: ["khora_topic:climate-tech"] } } }
```

Backfill: scan `relay_subscription_edges` → synthesize private subscription posts or register queries directly. Once stable, `relay_subscription_edges` becomes a derived index or is dropped; percolator term table replaces the topic inverted index.

### Phase 5 — Visibility enforcement

1. **`publishPost`**: filter self-fan-out targets by visibility
   - `network`: recipients = intersection(match owners, social peers of author)
   - `private`: no self-fan-out
2. **Read paths**: GET post / search hydration respects visibility
   - `private` subscription posts: only owner can resolve
   - `network`: only connected principals
3. **Catalog/discovery**: only `public` posts get projections

Connected-set lookup: `social.listRelationshipsForPrincipal(authorDid)` → peer principal IDs.

---

## What to delete when done

| Current | Replacement |
|---------|-------------|
| `relay_subscription_edges` direct writes | subscription posts → percolator |
| `/v1/topics/:slug/subscribe` | `POST /v1/posts` subscription shim → remove |
| `addProbeHitReasons` / `probe-hit.ts` | percolator on content publish |
| Topic fan-out loop in `publishPost` | percolator matches |

---

## Key design decisions

1. **One kind:** Single `subscription` kind with `search` discriminating exact vs semantic (empty `content` = filter-only). `kind: "probe"` is removed.

2. **Do content posts still carry `topics`?** Yes for authoring/hydration; routing should not depend on a parallel edge table. Topics become candidate labels at index + percolator time.

3. **Catalog vs projections for public subscriptions?** Short term: `relay_catalog_projections` namespace (consistent with existing Tier 1). Long term: enable `replicate_to_catalog` for public marker posts to make Colonnade discovery the cross-product catalog surface.

4. **Percolator DB placement:** Co-locate with catalog DB. Subscription routing is host-global and survives without memories.

5. **Exhaustive vs capped delivery:** Percolator is exhaustive above `minScore` by design. Watch fan-out volume — may need per-author rate limits later.

---

## Suggested first PR

1. Bootstrap percolator in host (Phase 1)
2. On content `POST_CREATED`, run `evaluateCandidate` and fan out to query owners (Phase 2)
3. Register queries when a `kind: "subscription"` post is created (Phase 3, minimal contract addition)
4. Leave legacy edge-based topic fan-out behind `KHORA_LEGACY_SUBSCRIPTION_EDGES=1` until backfill

That gives you the correct standing-search direction immediately without forcing the visibility/subscription-as-post migration in the same PR.
