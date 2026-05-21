# `@khoralabs/atrium-host`

Composes **relay-colonnade**, **atrium-auth**, and **`AgentRelay`**: registration, profiles/posts domain events, subscription fan-out, frame-channel hub, invites, and principal teardown. Does **not** ship HTTP or WebSocket handlers — see **`@khoralabs/atrium-server`**.

## Storage (three tiers)

Details: [colonnade-usage.md](./colonnade-usage.md), [id-conventions.md](./id-conventions.md).

| Tier | What | Where |
|------|------|--------|
| **1** | Profiles, registrations, subscriptions, username index, social/rooms | Relay catalog SQLite: `relay_catalog_projections` + edge tables (`relay_subscription_edges`, `relay_social_principal_channels`) |
| **2** | Post bodies | Author cell **outbox** only; ids are address-encoded (`atp0:…`) |
| **3** | Delivery to principals | Cell **inbox** — pointer fan-out (posts), inline JSON (room tickets) |

Posts are **not** in the catalog. Publication uses `replicate_to_catalog: false`; Colonnade publication catalog is the built-in noop (profiles/subs/rooms use `relay_catalog_projections`, not `CatalogPersistenceStrategy`).

**Fresh deploy:** wipe catalog SQLite, frames DB, and `cells/` when upgrading (no in-place migration).

## Entry point

```ts
const ctx = await createAtriumHost({
  catalogPath,
  framesDbPath,
  cellsDir,
  tenantKey?,           // default "relay"
  cellPoolCount?,       // default 16
  useCellWorkers?,      // default true
  startPrincipalTeardownWorker?, // default true
});
```

`AtriumHostContext` exposes `host` (`AgentRelay`), `auth`, `cluster`, `publicationClient`, `principalLifecycle`, `social`, `projectionStore`, catalog DB handles, `principalTeardownWorker`, optional `invitesRepo`, and catalog helpers from `createAtriumCatalogApi` (username lookup, room registry rows, phase-1 unregister).

## Posts

- Create/update/delete flow through `AgentRelay` → `on-event` → `publishPost` (outbox + optional inbox fan-out).
- Resolve: `decodePostId` / `resolvePostById` / `deletePostOutboxRecord` (exported from this package).
- PATCH appends a new outbox record → **new post id**; no re-fan-out.

## Inbox drain

Per-principal delivery on each principal's home cell. `popRelayInboxDrainItemsForDid` runs on inbox WebSocket open (`GET /v1/inbox/ws` in the server app).

| Delivery | Staging |
|----------|---------|
| Post fan-out | Pointer → author outbox |
| Room ticket | Inline JSON |

See [`@khoralabs/atrium-transport`](../transport) for WebSocket frame shapes.

## Invites

When `ATRIUM_INVITE_PEPPER` is set: pepper-hashed rows in `at2_invite_tokens`. Env: `ATRIUM_INVITE_REQUIRED`, `ATRIUM_INVITES_PER_REGISTRATION`, `ATRIUM_INVITE_SEED_TOKENS`.

## Scripts

- `bun run typecheck` — `tsc --noEmit`
