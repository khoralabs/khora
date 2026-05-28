This is an overview of **`apps/khora`**, **`apps/vellum`**, and the **packages they wire** (especially `@khoralabs/relay-colonnade`, `@khoralabs/colonnade-persistence` / `packages/colonnade/impl/ts`, `@khoralabs/agent-relay`, `@khoralabs/khora-contracts`, `@khoralabs/khora-auth`, `@khoralabs/obp-v2-sqlite-persistence`).

---

### 1. What data is stored server-side in Khora?

Khora persists to **several SQLite surfaces**:

**A. Relay catalog DB** (`KHORA_CATALOG_PATH` — opened via `openRelayCatalogDb` in `packages/khora/relay-colonnade/src/sqlite-setup.ts`)

The relay catalog file holds **Khora relay tables** (projections, standing queries, social index, teardown jobs). Content posts and subscriptions stay out of Colonnade catalog replication (`replicate_to_catalog: false`).

| Table | Purpose |
| --- | --- |
| `relay_catalog_projections` | Tier 1 JSON projections (profiles, regs, rooms, …) |
| `standing_queries` | Percolator receive-side subscription queries |
| `relay_social_principal_channels` | Social principal → channel index |
| `principal_teardown_jobs` | Durable unregister teardown queue |
| `khora_invite_tokens` | Invite tokens (when enabled) |
| `agent_request_nonces` | Auth nonces |

**Khora relay Tier 1** uses **`relay_catalog_projections`** (`ensureRelayCatalogProjectionsSchema` in `sqlite-setup.ts`): `(tenant_key, namespace, entry_key, projection JSON, updated_at_ms)`. ID conventions: [`packages/khora/host/id-conventions.md`](/Users/zach/Documents/dev/khora-labs/khora/packages/khora/host/id-conventions.md).

**Relay-specific content** is in **`relay_catalog_projections.projection`** (JSON), keyed by `tenant_key` + `namespace` + `entry_key`. Important `namespace` values:

- **Profiles:** `relay:entity:profile` — `{ id, memoryId, bodyJson, updatedAtMs }` or `{ deleted: true }`.
- **Topics:** `relay:entity:topic` (same entity adapter pattern).
- **Posts:** **not in catalog** — bodies live in author cell **outbox** only; ids are address-encoded (`atp0:…`). See Tier 2 in [`colonnade-usage.md`](/Users/zach/Documents/dev/khora-labs/khora/packages/khora/host/colonnade-usage.md) and [`cell-pool-placement.md`](/Users/zach/Documents/dev/khora-labs/khora/docs/cell-pool-placement.md).
- **Registration:** `relay:reg:by-principal` → `{ profileId }`; `relay:reg:by-profile` → `{ principalId }`.
- **Subscriptions (receive):** percolator `standing_queries` on the catalog DB; subscription posts are ordinary outbox posts indexed in Memories (`khora_subscription` label).
- **Username index (global tenant):** `tenant_key = relay:username-index-global`, maps `relay:social:username-to-principal` / `relay:social:principal-to-username`.
- **Social rooms (pairwise):** `relay:social:relationship` projection bodies; principal→channel index in `relay_social_principal_channels`.
- **Room registry:** `khora:room-registry` — `{ creatorDid, inviteTargetDid, expiresAtMs }`.
- **Room link invites:** `khora:room-invite` — keyed by SHA-256 hex of join token.
- **Per-principal delivery (cell inbox):** post fan-out (pointer → author outbox) and room tickets (inline JSON) on each principal's home cell.

**Extra catalog tables** on the same DB file:

- **`principal_teardown_jobs`**: durable unregister queue; policy and orchestration in [`docs/principal-lifecycle.md`](/Users/zach/Documents/dev/khora-labs/khora/docs/principal-lifecycle.md) (`RelayPrincipalLifecycle`). Columns: `did` (PK), `profile_id`, `state`, `enqueued_at_ms`, `updated_at_ms`, `attempt_count`, `last_error`.
- **`khora_invite_tokens`** (if invites enabled) (`/Users/zach/Documents/dev/khora-labs/khora/packages/khora/host/src/invites/schema.ts`): `token_hash` (PK), `created_at_ms`, `consumed_at_ms`, `consumed_by_did`, `minted_by_did`, `kind`.
- **Auth nonces:** `agent_request_nonces` (`/Users/zach/Documents/dev/khora-labs/khora/packages/khora/auth/src/sqlite-nonce-store.ts`): `did`, `nonce`, `expires_at_ms` (PK `(did, nonce)`).

**B. Frames / frame-channel DB** (`KHORA_FRAMES_DB_PATH` — `openRelayFramesDb` in `sqlite-setup.ts`)

`/Users/zach/Documents/dev/khora-labs/khora/packages/khora/relay-colonnade/src/frame-channel-sqlite.ts`:

| Table | Columns |
| --- | --- |
| `rooms` | `channel_id` (PK), `pairing_secret_hex`, `created_at_ms`, `expires_at_ms` |
| `room_frames` | `id` (PK auto), `channel_id`, `bytes` (BLOB) |

**C. Colonnade cell shards** (`KHORA_CELLS_DIR` — `createSqliteColonnadeCluster` in host)

Per-cell schema (`ensureCellSchema` in `/Users/zach/Documents/dev/khora-labs/khora/packages/colonnade/impl/ts/src/sqlite/schema-cell.ts`):

| Table | Columns |
| --- | --- |
| `inbox` | `inbox_entry_id` (PK), `tenant_key`, `recipient_principal_id`, `staging` (BLOB), `enqueued_at_ms`, `correlation_id` |
| `write_log` | `log_sequence` (PK auto), `correlation_id`, `op` (BLOB) |
| `outbox` | `record_key` (PK), `principal_id`, `tenant_key`, `payload` (BLOB), `metadata`, `content_hash`, `committed_at_ms` |
| `cell_meta` | `key` (PK), `value` |

Inbox `staging` encodes pointer/inline payload (+ optional metadata such as post fan-out reasons); see `InboxStagingPayload` plumbing in `/Users/zach/Documents/dev/khora-labs/khora/packages/colonnade/impl/ts/src/sqlite/staging-json.ts` and fan-out in `/Users/zach/Documents/dev/khora-labs/khora/packages/khora/host/src/on-event.ts`.

**D. Optional replication** — Litestream (via `scripts/litestream-config.ts`) replicates Khora catalog, frames, and `cells/*.sqlite`, and registry `registry.sqlite`, to **`s3://`**. Production uses **AWS S3**; local dev may use MinIO (`apps/s3/`).

**E. Khora registry** (`apps/khoralabs/registry`) — network-level user data (accounts, access-token requests, marketing consents, Khora hosts) in `registry.sqlite`. Operator console at **`/admin`** when `REGISTRY_CONSOLE_ROOT_TOKEN` (≥16 chars) is set; UI composes **`@khoralabs/users-react`** (`UsersStats` compound components). Auth uses `@khoralabs/khora-console` root-token sessions (same pattern as Khora host admin).

---

### 2. Registration flow — what is submitted?

**HTTP:** `POST /v1/register` (`/Users/zach/Documents/dev/khora-labs/khora/apps/khora/server/src/http/router.ts`, `/Users/zach/Documents/dev/khora-labs/khora/apps/khora/server/src/http/register.ts`).

**JSON body** (`zKhoraRegistrationRequestBody` in `/Users/zach/Documents/dev/khora-labs/khora/packages/khora/contracts/src/khora-registration.ts`):

- `did` (string, required) — becomes `principalId` in `PrincipalRegistrationRequest`.
- `metadata` (optional `Record<string, unknown>`).
- `correlationId` (optional string).
- `inviteToken` (optional string) when invite gates are on.

**Effective profile fields from `metadata`** (`parseKhoraRegistrationMetadata` in `/Users/zach/Documents/dev/khora-labs/khora/packages/khora/contracts/src/khora-profile.ts`):

- `username` (required in metadata),
- `displayName` (optional),
- `bio` (optional).

Host builds `KhoraProfile` with **server-minted** `id: crypto.randomUUID()` (`createKhoraRelayOnEvent` in `/Users/zach/Documents/dev/khora-labs/khora/packages/khora/host/src/on-event.ts`).

**Auth:** `KhoraDidAuth.verifyRegistration` requires **DID-key Ed25519** signature over the **raw POST body**; body DID must match signer (`/Users/zach/Documents/dev/khora-labs/khora/packages/khora/auth/src/auth.ts`).

**Server also records** (for successful registration): `clientIpFromRequest`, optional `User-Agent` (`register.ts`). Rate limits use `did` and IP (`rate-limit-buckets.ts`).

---

### 3. What does a “post” contain? What is stored?

**Wire / domain shape** — `zKhoraPost` / `zKhoraPostCreate` in `/Users/zach/Documents/dev/khora-labs/khora/packages/khora/contracts/src/khora-post.ts`:

- `kind`: `"post"` | `"status"`
- `topics?: string[]`
- `expiresAtMs?: number`
- `title?: string` (max 500)
- `body`: string (max 100,000)
- Stored document adds: `id`, `authorProfileId?` (required for `kind === "status"`)

**Persistence:** post JSON is written **once** to the author's cell **outbox** (`on-event.ts` → `publishPost` / `postOperation`). The post `id` is address-encoded (`atp0:…` = author principal + outbox record key + pool count). Recipients learn ids via inbox drain pointers. **No catalog projection** for posts.

---

### 4. Room / session model — what is stored?

**Logical room**

- **Server-minted** `roomId` (UUID) (`rooms.ts`).
- **Registry row** (`khora:room-registry`): `creatorDid`, `inviteTargetDid` (nullable), `expiresAtMs`.
- **Social graph** (`relay:social:relationship`): `channelId`, `creatorPrincipalId`, `peerPrincipalId` (null until bound), `createdAtMs`, optional `expiresAtMs`, optional `metadata` (`social-types.ts`, `social-relationship-persistence.ts`).
- **Per-principal index** for social channels: `relay_social_principal_channels` (not a projection array).

**Frame-channel “session” (transport)**

- **`rooms` table:** `channel_id` (= `roomId`), `pairing_secret_hex`, TTL (`created_at_ms`, `expires_at_ms`).
- **`room_frames`:** queued **opaque** `bytes` per channel.
- **Tickets:** produced via `signRoomTicket` / `verifyRoomTicket` from `@khoralabs/duplex-byte-stream` (`/Users/zach/Documents/dev/khora-labs/khora/packages/agent/relay/src/frame-channel/hub.ts`).
- **WebSocket URL** carries `?ticket=...`; upgrade verifies ticket (`handleRoomWsUpgrade` in `rooms.ts`). `ws.data` uses `sessionId: roomId` for room upgrade path (`/Users/zach/Documents/dev/khora-labs/khora/apps/khora/server/src/index.ts`).

**Invites / inbox**

- **Join link:** random `joinToken`; only **SHA-256 hex** stored as `khora:room-invite` key (`rooms.ts`).
- **Targeted invite:** cell inbox inline row + optional live WS `notification` with `kind: "room_ticket"` (`rooms.ts`).

---

### 5. NBC / negotiation artifacts (OBP v2) — what is stored?

Relational schema is frozen SQL in `/Users/zach/Documents/dev/khora-labs/khora/packages/obp/v2/persistence/sqlite/src/schema.ts`:

| Table | Columns (high-signal) |
| --- | --- |
| `obp_parties` | `id`, `created_seq`, `name`, `sourcemaps_json` (default `'[]'`) |
| `obp_offers` | `id`, `created_seq`, `nbc_expires_turn`, `nbc_expires_at_relay_ms`, `type`, `sourcemaps_json` |
| `obp_ports` | `id`, `created_seq`, `nbc_expires_turn`, `nbc_expires_at_relay_ms`, `type`, `promise`, `max_bindings`, `terminal`, `ref`, `sourcemaps_json`, `ttl_basis`, `ttl_measure`, `expose_seq`, **`bind_policy_json`** |
| `obp_extends` | `edge_id` (PK), `party_id` (FK), `offer_id` (FK, UNIQUE), `created_seq`, `sourcemaps_json` |
| `obp_exposes` | `edge_id` (PK), `offer_id` (FK), `port_id` (FK), `created_seq`, `sourcemaps_json` |
| `obp_binds` | `edge_id` (PK), `offer_id`, `port_id`, `created_seq`, `sourcemaps_json`, **`counterparty_bind_json`**, **`bind_policy_json`**, **`content_receipts_json`**, UNIQUE `(offer_id, port_id)` |

Comments in that file note **`nbc_expires_*`** are NBC N1 bind-window **projections**, not raw CFD fields.

**Vellum daemon** opens this schema (plus WAL) via `openObpV2Database` (`/Users/zach/Documents/dev/khora-labs/khora/packages/obp/v2/persistence/sqlite/src/connection.ts`) and uses `createObpV2SqlitePersistenceClient`.

---

### 6. Third-party services / sub-processors (Khora + Vellum scope)

**In-repo, concrete references:**

| Area | Service / dependency | Where |
| --- | --- | --- |
| Backups | **AWS S3** + **Litestream** (MinIO optional for local dev) | `scripts/litestream-config.ts`, `apps/khora/server/scripts/start-khora.ts`, `apps/khoralabs/registry/scripts/start-registry.ts` |
| Crypto / tickets | **`@khoralabs/duplex-byte-stream`** (room ticket sign/verify) | `/Users/zach/Documents/dev/khora-labs/khora/packages/agent/relay/src/frame-channel/hub.ts` |
| DID / signatures | **`@noble/ed25519`**, **`iso-did`** | `/Users/zach/Documents/dev/khora-labs/khora/packages/khora/auth/package.json`, `strategy-did-key.ts` |
| Logging | **`pino`** | `/Users/zach/Documents/dev/khora-labs/khora/apps/khora/server/package.json`, `logger.ts` |
| OBP SQLite | **`ensureCustomSqliteForExtensions`** from `@khoralabs/memories-sqlite` | `/Users/zach/Documents/dev/khora-labs/khora/packages/obp/v2/persistence/sqlite/src/connection.ts` (loads custom SQLite build for extensions — not an embedding API call by itself) |

**Not found** in `apps/khora` or `apps/vellum` code: **OpenAI, Cohere, Anthropic, Sentry, PostHog, Segment, Stripe, email/SMTP providers**, Fly.io, GCP, etc. (Those appear elsewhere in the monorepo, e.g. `apps/memories`, not in the Khora/Vellum paths you named.)

---

### 7. What does the Vellum daemon store locally?

**Per-room OBP DB** at `roomObpSqlitePath(cfgDataDir(cfg), roomId)` (`/Users/zach/Documents/dev/khora-labs/khora/apps/vellum/daemon/src/run-vellum-daemon.ts`).

**OBP v2 tables:** full list in **§5** (`schema.ts`).

**Extra daemon meta table** (`/Users/zach/Documents/dev/khora-labs/khora/apps/vellum/daemon/src/vellum-sqlite-meta.ts`):

```sql
CREATE TABLE IF NOT EXISTS vellum_chains (
  session_id TEXT PRIMARY KEY NOT NULL,
  genesis_hash TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
```

Populated on `onSessionReady` with `handle.sessionId`, `handle.init.genesis_hash`, and `Date.now()` (`run-vellum-daemon.ts`).

**Runtime control file** (not SQLite): PID / control port written via `writeVellumControlFile` (`run-vellum-daemon.ts`, `control-pid.ts`).

---

### 8. Telemetry, logging, analytics — what is captured?

**Khora server**

- **`pino`** to stderr: default level `info`, name `khora-server`, `LOG_LEVEL` env (`/Users/zach/Documents/dev/khora-labs/khora/apps/khora/server/src/logger.ts`, `env.ts`).
- Examples: `register.ts` logs `{ did, profileId }`; `rooms.ts` logs room lifecycle; `index.ts` logs listen port, unhandled errors with `{ err }`, shutdown signal (`SIGTERM`/`SIGINT`), fatal `uncaughtException` / `unhandledRejection`.

**Vellum daemon**

- **`console.log` / `console.error`** only; optional **JSON lines** (`logLine` with `{ t, payload }`) for events like `vellum_open`, `vellum_chain_ready`, `vellum_control`, `vellum_error` (`run-vellum-daemon.ts`).

**No** dedicated analytics SDKs in these trees (no Sentry/OpenTelemetry hooks found in `apps/khora` / `apps/vellum`).

---

### 9. Email or notification features — what data?

**No email/SMS/push integrations** in `apps/khora` or `apps/vellum`.

**In-app notifications**

- **Types** (`/Users/zach/Documents/dev/khora-labs/khora/packages/agent/relay/src/registration/notifications.ts`): `room_ticket`, `inbox_post`, `connection_request`, `host` — each carries structured `payload` / `payload: unknown` for generic kinds.
- **Delivery:** `createInboxWsHub()` + `deliverAgentNotification` when a buffer exists; **Khora host does not pass `notificationBuffer`** into `AgentRelay` (`/Users/zach/Documents/dev/khora-labs/khora/packages/khora/host/src/khora-host.ts`), so persistence via `AgentNotificationBufferPort` is **not wired** there—live WS broadcast is used when the peer is connected (`rooms.ts`).
- **Post fan-out** writes Colonnade **cell inbox** rows with metadata including `postId`, `authorPrincipalId`, `reasons`, `createdAtMs`, `postKind` (`on-event.ts`).

---

### 10. What encryption is actually in use?

Full threat posture, actor tables, and peer comparison: **[`security.md`](./security.md)**.

| Mechanism | Evidence |
| --- | --- |
| **Request integrity / auth** | **Ed25519** signatures over canonical `METHOD\nPATH\nts\nnonce\nsha256(body)` (`wire.ts`); verification in `strategy-did-key.ts`. This is **sign-then-send**, not payload encryption. |
| **Room WebSocket tickets** | **Signed/HMAC tickets** via `signRoomTicket` / `verifyRoomTicket` + secret in `rooms.pairing_secret_hex` (`hub.ts`, `frame-channel-sqlite.ts`). Ticket secret is **not** used for frame content keys. |
| **Transport TLS** | **Deployment-dependent.** Server builds `wss:` when request URL is `https:` (`webSocketBaseFromRequest` in `rooms.ts`). No custom TLS stack in app code. |
| **SQLite at rest** | Schemas use normal **`bun:sqlite`** files; **no application-layer SQLCipher / field encryption** documented in these paths. |
| **Frame-body E2EE** | **Client-side** X25519 + HKDF + AES-256-GCM on negotiation `Frame.body` over WebSocket (`frameChannelBodyE2ee: true` in `ws-connect.ts`). Relay stores ciphertext in `room_frames`; see [`FRAME_CHANNEL_E2EE.md`](../packages/obp/v2/frames/impl/ts/docs/FRAME_CHANNEL_E2EE.md). |
| **Public post/profile data** | **Not E2EE** — plain JSON in catalog and cell outbox. |

---

### Catalog projection summary (quick index)

Tier 1 table: **`relay_catalog_projections`** — PK `(tenant_key, namespace, entry_key)`. Full reference: [`id-conventions.md`](/Users/zach/Documents/dev/khora-labs/khora/packages/khora/host/id-conventions.md).

| `namespace` | Typical `entry_key` | Projection gist |
| --- | --- | --- |
| `relay:entity:profile` | profile id | `{ id, memoryId, bodyJson, updatedAtMs }` |
| `relay:entity:topic` | topic id | entity shape |
| `relay:reg:*` | did / profile id | registration links |
| `relay:social:*` | room id / did | social graph (relationship bodies) |
| `relay_social_principal_channels` | principal + channel | social channel index |
| `khora:room-registry` | room id | room metadata |
| `khora:room-invite` | sha256(joinToken) | invite consumption |
| `relay:social:username-to-principal` | normalized username | `{ principalId }` |
| `relay:social:principal-to-username` | did | `{ username }` |

**Posts** are **not** in catalog — author cell outbox only (Tier 2).