# Colonnade usage in Atrium

Three storage tiers for relay data. See [id-conventions.md](./id-conventions.md) for every stable identifier.

## Tier 1 — Catalog projections

**What:** Small JSON documents with central read paths (profiles, registrations, subscriptions, username index, social relationships, room registry/invites).

**Where:** `relay_catalog_projections` table via `RelayCatalogProjectionStore` (`packages/atrium/relay-colonnade`).

**Rules:**

- No Colonnade pointer columns — projection-only KV keyed by `(tenant_key, namespace, entry_key)`.
- Use SQLite `JSON` column type; hot fields have expression indexes (username → principal, room creator).
- Namespace constants live in `relay-id-conventions.ts`.
- **Set indexes** (subscriptions, social principal→channel) use normalized edge tables — not JSON arrays in projections.
- **No Colonnade publication catalog path** — `replicate_to_catalog: false`; `ColonnadePublicationClient` uses built-in noop when no strategy is passed (see `.idea/docs/colonnade.md` §3 two layers).

## Tier 2 — Author outbox (posts)

**What:** Post JSON bodies only.

**Where:** Author's cell `outbox` table. Written once via `PostOperation` / `publishPost`.

**Rules:**

- **No catalog rows for posts.** No `source_map_rows`, no metadata stub, no search index yet.
- Post `id` is address-encoded (`atp1:` + base64url JSON of `{ authorPrincipalId, authorCellId, recordKey }`). The id **is** the locator.
- Resolve: `decodePostId` → `fetchOutboxPayload`. Ghost when outbox row deleted (`bytes_available === false`).
- PATCH appends a new outbox record → **new post id** (immutable revisions). No re-fan-out on update.
- Recipients learn post ids from **inbox drain** (pointer staging metadata includes `postId`).

## Tier 3 — Cell inbox (delivery)

**What:** Per-principal fan-out and session delivery.

**Where:** Recipient cell `inbox` table.

**Rules:**

- Post fan-out: **pointer** staging → author outbox (content-addressed verify on drain).
- Room tickets: **inline** JSON staging (no pointer).
- Deliverability: author registered + no active teardown job + outbox bytes available.

## Anti-patterns

- Putting post bodies in catalog projections or `source_map_rows`.
- Synthetic pointers for Tier 1 entities (removed).
- Duplicating outbox bytes in catalog on create.
- Using random UUID post ids (use address-encoded ids).

## Fresh deploy

This layout is **not** upgraded in place. Wipe catalog SQLite, frames DB, and `cells/` directory before deploying a build with this schema.

## Deferred

- Post search / topic discovery (separate structure when needed).
- `catalog_pointers` / `discovery_documents` for posts (`replicate_to_catalog: false`).
