# `@khoralabs/atrium-host`

Library that composes **relay-colonnade** persistence, **atrium-auth**, and **`AgentRelay`**: registration pipeline, profiles/posts domain events, topic/author fan-out, frame-channel hub, and invites. It does **not** ship HTTP or Bun WebSocket handlers.

## Colonnade storage

Three tiers — see [colonnade-usage.md](./colonnade-usage.md) and [id-conventions.md](./id-conventions.md):

1. **Catalog projections** — profiles, subscriptions, rooms (`relay_catalog_projections`, JSON + indexes)
2. **Author outbox** — post bodies only; address-encoded post ids (`atp1:…`)
3. **Cell inbox** — pointer fan-out (posts) + inline room tickets

**Fresh deploy:** wipe catalog SQLite, frames DB, and `cells/` when upgrading to this layout (no in-place migration).

## Wiring

1. `createAtriumHost({ catalogPath, framesDbPath, cellsDir, tenantKey? })` opens the catalog + frames DBs, constructs auth, inbox hub, frame-channel hub, and `AgentRelay`.
2. **Ingress** (HTTP routes, `Bun.serve`, WebSocket upgrade + drain) lives in **`apps/atrium/server`** (`@khoralabs/atrium-server`).

## Inbox semantics

Per-principal delivery uses a **single cell inbox** on each principal's home cell. Drain is implemented in `popRelayInboxDrainItemsForDid` and invoked on inbox WebSocket open (`GET /v1/inbox/ws`).

| Delivery | Staging | Source |
|----------|---------|--------|
| Post fan-out | **pointer** → author outbox | `POST_CREATED` via `PostOperation` |
| Room ticket (targeted invite) | **inline** JSON | `enqueueCellInboxInline` from room create |

Drain sends `{ type: "drain", items: [{ entryKey, pointer, projection }] }` then deletes drained rows.

**Live `room_ticket`:** If the target has an inbox socket connected at room create time, a `type: "notification"` frame is also broadcast (in addition to the durable cell inbox row).

See [`@khoralabs/atrium-transport`](../transport) `parseInboxWebSocketMessage` for supported frame shapes including **`drain`**.

## Invites

- **Storage:** Pepper-hashed rows in `at2_invite_tokens` (`inviteToken` on registration, preview/list when wired by v2).
- **Environment:** `ATRIUM_INVITE_PEPPER`, `ATRIUM_INVITE_REQUIRED`, `ATRIUM_INVITES_PER_REGISTRATION`, `ATRIUM_INVITE_SEED_TOKENS` (see `createAtriumHost` and `invites/atrium-invites.ts`).

Public helpers: `inviteRequiredFromEnv`, `invitesPerRegistrationFromEnv`, types on the package barrel.

## Author / topic subjects

Export `topicSubscriptionSubject`, `authorSubscriptionSubject`, `authorTopicSubscriptionSubject`, and parsers from the package barrel — used for fan-out and by v2 author-subscribe routes.

## HTTP routes (reference)

Served by **`@khoralabs/atrium-server`**, not this package:

| Method | Path |
|--------|------|
| GET | `/health` |
| POST | `/v1/register` |
| POST | `/v1/unregister` |
| POST | `/v1/invite/preview` |
| GET | `/v1/invites` |
| GET | `/v1/authors/subscriptions` |
| POST / DELETE | `/v1/authors/:username/subscribe` |
| POST / DELETE | `/v1/authors/:username/topics/:topicSlug/subscribe` |
| PATCH | `/v1/profile` |
| GET | `/v1/profile/by-did/:did` |
| GET | `/v1/profile/by-username/:username` |
| POST / PATCH / DELETE | `/v1/posts`, `/v1/posts/:id` |
| GET | `/v1/agent/status` |
| GET | `/v1/inbox/ws` |
| POST / DELETE | `/v1/topics/:slug/subscribe` |
| POST | `/v1/rooms` |
| GET | `/v1/rooms/:roomId/ws?ticket=…` |

## Scripts

- `bun run typecheck` — `tsc --noEmit`
