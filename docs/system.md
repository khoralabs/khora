This is an overview of **`apps/atrium`**, **`apps/vellum`**, and the **packages they wire** (especially `@khoralabs/relay-colonnade`, `@khoralabs/colonnade-persistence` / `packages/colonnade/impl/ts`, `@khoralabs/agent-relay`, `@khoralabs/atrium-contracts`, `@khoralabs/atrium-auth`, `@khoralabs/obp-v2-sqlite-persistence`).

---

### 1. What data is stored server-side in Atrium?

Atrium persists to **several SQLite surfaces**:

**A. Relay catalog DB** (`ATRIUM_CATALOG_PATH` — opened via `openRelayCatalogDb` in `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/relay-colonnade/src/sqlite-setup.ts`)

Colonnade catalog tables (`ensureCatalogSchema` in `/Users/zach/Documents/dev/khora-labs/khora/packages/colonnade/impl/ts/src/sqlite/schema-catalog.ts`):

| Table | Columns |
| --- | --- |
| `discovery_documents` | `document_key` (PK), `body`, `revision` |
| `catalog_pointers` | `catalog_pointer_id` (PK), `locator_cell_id`, `locator_record_key`, `content_hash`, `projection` |
| `source_map_rows` | `tenant_key`, `source_map_id`, `entry_key`, `pointer_source_cell_id`, `pointer_source_record_key`, `pointer_content_hash`, `projection`, `source_row_content_hash` — **PK** `(tenant_key, source_map_id, entry_key)` |
| `connection_tokens` | `token` (PK), `principal_id`, `intended_audience`, `expires_at_ms` |

**Relay-specific content** is mostly **`source_map_rows.projection`** (JSON), keyed by `tenant_key` + `source_map_id` + `entry_key`. Important `source_map_id` values:

- **Profiles:** `relay:entity:profile` — projection shape from `createCatalogEntityAdapter`: `{ id, memoryId, bodyJson, updatedAtMs }` or `{ deleted: true }` (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/relay-colonnade/src/catalog-entity-adapter.ts`).
- **Posts:** `relay:entity:post` — same entity projection; `bodyJson` is JSON text of an `AtriumPost`.
- **Post index:** `relay:post-index` — projection `{ postIds: string[] }` (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/relay-colonnade/src/catalog-post-adapter.ts`).
- **Topics:** `relay:entity:topic` (same entity adapter pattern).
- **Registration:** `relay:reg:by-principal` → `{ profileId }`; `relay:reg:by-profile` → `{ principalId }` (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/relay-colonnade/src/catalog-registration-adapter.ts`).
- **Subscriptions:** `relay:subs:by-principal` → `{ subjects: string[] }`; `relay:subs:by-subject` → `{ principals: string[] }` (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/relay-colonnade/src/catalog-subscription-adapter.ts`).
- **Username index (global tenant):** `tenant_key = relay:username-index-global`, maps `relay:social:username-to-principal` / `relay:social:principal-to-username` (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/relay-colonnade/src/social-registration.ts`).
- **Social rooms (pairwise):** `relay:social:relationship`, `relay:social:relationships-by-principal` — relationship projection as in `SocialRelationshipRow` (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/relay-colonnade/src/social-relationship-persistence.ts`, `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/relay-colonnade/src/social-types.ts`).
- **Room registry:** `at2:room-registry` — projection `{ creatorDid, inviteTargetDid, expiresAtMs }` (`/Users/zach/Documents/dev/khora-labs/khora/apps/atrium/server/src/http/rooms.ts`, `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/host/src/catalog-facade.ts`).
- **Room link invites:** `at2:room-invite` — keyed by **SHA-256 hex** of join token; projection `{ roomId, creatorDid, inviteExpiresAtMs, consumedByDid, consumedAtMs }` (`rooms.ts`, `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/host/src/room-invite.ts`).
- **Inbox ticket pointers:** `relay:inbox` — e.g. `entry_key = "${targetDid}/${roomId}"` with payload including `kind: "room_ticket"`, `channelId`, `ticket`, `webSocketUrl`, etc. (`rooms.ts`, `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/host/src/relay-inbox.ts`).

**Extra catalog tables** on the same DB file:

- **`principal_teardown_jobs`** (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/relay-colonnade/src/principal-teardown-jobs.ts`): `did` (PK), `profile_id`, `state`, `enqueued_at_ms`, `updated_at_ms`, `attempt_count`, `last_error`.
- **`at2_invite_tokens`** (if invites enabled) (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/host/src/invites/schema.ts`): `token_hash` (PK), `created_at_ms`, `consumed_at_ms`, `consumed_by_did`, `minted_by_did`, `kind`.
- **Auth nonces:** `agent_request_nonces` (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/auth/src/sqlite-nonce-store.ts`): `did`, `nonce`, `expires_at_ms` (PK `(did, nonce)`).

**B. Frames / frame-channel DB** (`ATRIUM_FRAMES_DB_PATH` — `openRelayFramesDb` in `sqlite-setup.ts`)

`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/relay-colonnade/src/frame-channel-sqlite.ts`:

| Table | Columns |
| --- | --- |
| `rooms` | `channel_id` (PK), `pairing_secret_hex`, `created_at_ms`, `expires_at_ms` |
| `room_frames` | `id` (PK auto), `channel_id`, `bytes` (BLOB) |

**C. Colonnade cell shards** (`ATRIUM_CELLS_DIR` — `createSqliteColonnadeCluster` in host)

Per-cell schema (`ensureCellSchema` in `/Users/zach/Documents/dev/khora-labs/khora/packages/colonnade/impl/ts/src/sqlite/schema-cell.ts`):

| Table | Columns |
| --- | --- |
| `inbox` | `inbox_entry_id` (PK), `tenant_key`, `recipient_principal_id`, `staging` (BLOB), `enqueued_at_ms`, `correlation_id` |
| `write_log` | `log_sequence` (PK auto), `correlation_id`, `op` (BLOB) |
| `outbox` | `record_key` (PK), `principal_id`, `tenant_key`, `payload` (BLOB), `metadata`, `content_hash`, `committed_at_ms` |
| `cell_meta` | `key` (PK), `value` |

Inbox `staging` encodes pointer/inline payload (+ optional metadata such as post fan-out reasons); see `InboxStagingPayload` plumbing in `/Users/zach/Documents/dev/khora-labs/khora/packages/colonnade/impl/ts/src/sqlite/staging-json.ts` and fan-out in `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/host/src/on-event.ts`.

**D. Optional replication** — Litestream config in `/Users/zach/Documents/dev/khora-labs/khora/apps/atrium/server/scripts/start-atrium.ts` replicates catalog, frames, and `cells/*.sqlite` to **`s3://`** (S3-compatible).

---

### 2. Registration flow — what is submitted?

**HTTP:** `POST /v1/register` (`/Users/zach/Documents/dev/khora-labs/khora/apps/atrium/server/src/http/router.ts`, `/Users/zach/Documents/dev/khora-labs/khora/apps/atrium/server/src/http/register.ts`).

**JSON body** (`zAtriumRegistrationRequestBody` in `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/contracts/src/atrium-registration.ts`):

- `did` (string, required) — becomes `principalId` in `PrincipalRegistrationRequest`.
- `metadata` (optional `Record<string, unknown>`).
- `correlationId` (optional string).
- `inviteToken` (optional string) when invite gates are on.

**Effective profile fields from `metadata`** (`parseAtriumRegistrationMetadata` in `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/contracts/src/atrium-profile.ts`):

- `username` (required in metadata),
- `displayName` (optional),
- `bio` (optional).

Host builds `AtriumProfile` with **server-minted** `id: crypto.randomUUID()` (`createAtriumRelayOnEvent` in `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/host/src/on-event.ts`).

**Auth:** `AtriumDidAuth.verifyRegistration` requires **DID-key Ed25519** signature over the **raw POST body**; body DID must match signer (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/auth/src/auth.ts`).

**Server also records** (for successful registration): `clientIpFromRequest`, optional `User-Agent` (`register.ts`). Rate limits use `did` and IP (`rate-limit-buckets.ts`).

---

### 3. What does a “post” contain? What is stored?

**Wire / domain shape** — `zAtriumPost` / `zAtriumPostCreate` in `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/contracts/src/atrium-post.ts`:

- `kind`: `"post"` | `"status"`
- `topics?: string[]`
- `expiresAtMs?: number`
- `title?: string` (max 500)
- `body`: string (max 100,000)
- Stored document adds: `id`, `authorProfileId?` (required for `kind === "status"`)

**Persistence:** posts are upserted as catalog entities: projection includes `bodyJson: JSON.stringify(post)` (`on-event.ts` → `persistenceClient.upsertPost`).

---

### 4. Room / session model — what is stored?

**Logical room**

- **Server-minted** `roomId` (UUID) (`rooms.ts`).
- **Registry row** (`at2:room-registry`): `creatorDid`, `inviteTargetDid` (nullable), `expiresAtMs`.
- **Social graph** (`relay:social:relationship`): `channelId`, `creatorPrincipalId`, `peerPrincipalId` (null until bound), `createdAtMs`, optional `expiresAtMs`, optional `metadata` (`social-types.ts`, `social-relationship-persistence.ts`).
- **Per-principal index** lists `channelIds` under `relay:social:relationships-by-principal`.

**Frame-channel “session” (transport)**

- **`rooms` table:** `channel_id` (= `roomId`), `pairing_secret_hex`, TTL (`created_at_ms`, `expires_at_ms`).
- **`room_frames`:** queued **opaque** `bytes` per channel.
- **Tickets:** produced via `signRoomTicket` / `verifyRoomTicket` from `@khoralabs/duplex-byte-stream` (`/Users/zach/Documents/dev/khora-labs/khora/packages/agent/relay/src/frame-channel/hub.ts`).
- **WebSocket URL** carries `?ticket=...`; upgrade verifies ticket (`handleRoomWsUpgrade` in `rooms.ts`). `ws.data` uses `sessionId: roomId` for room upgrade path (`/Users/zach/Documents/dev/khora-labs/khora/apps/atrium/server/src/index.ts`).

**Invites / inbox**

- **Join link:** random `joinToken`; only **SHA-256 hex** stored as `at2:room-invite` key (`rooms.ts`).
- **Targeted invite:** `relay:inbox` row + optional live WS `notification` with `kind: "room_ticket"` (`rooms.ts`).

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

### 6. Third-party services / sub-processors (Atrium + Vellum scope)

**In-repo, concrete references:**

| Area | Service / dependency | Where |
| --- | --- | --- |
| Backups | **S3-compatible** + **Litestream** | `/Users/zach/Documents/dev/khora-labs/khora/apps/atrium/server/scripts/start-atrium.ts`, `.env.example` |
| Crypto / tickets | **`@khoralabs/duplex-byte-stream`** (room ticket sign/verify) | `/Users/zach/Documents/dev/khora-labs/khora/packages/agent/relay/src/frame-channel/hub.ts` |
| DID / signatures | **`@noble/ed25519`**, **`iso-did`** | `/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/auth/package.json`, `strategy-did-key.ts` |
| Logging | **`pino`** | `/Users/zach/Documents/dev/khora-labs/khora/apps/atrium/server/package.json`, `logger.ts` |
| OBP SQLite | **`ensureCustomSqliteForExtensions`** from `@khoralabs/memories-sqlite` | `/Users/zach/Documents/dev/khora-labs/khora/packages/obp/v2/persistence/sqlite/src/connection.ts` (loads custom SQLite build for extensions — not an embedding API call by itself) |

**Not found** in `apps/atrium` or `apps/vellum` code: **OpenAI, Cohere, Anthropic, Sentry, PostHog, Segment, Stripe, email/SMTP providers**, Fly.io, GCP, etc. (Those appear elsewhere in the monorepo, e.g. `apps/memories`, not in the Atrium/Vellum paths you named.)

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

**Atrium server**

- **`pino`** to stderr: default level `info`, name `atrium-server`, `LOG_LEVEL` env (`/Users/zach/Documents/dev/khora-labs/khora/apps/atrium/server/src/logger.ts`, `env.ts`).
- Examples: `register.ts` logs `{ did, profileId }`; `rooms.ts` logs room lifecycle; `index.ts` logs listen port, unhandled errors with `{ err }`, shutdown signal (`SIGTERM`/`SIGINT`), fatal `uncaughtException` / `unhandledRejection`.

**Vellum daemon**

- **`console.log` / `console.error`** only; optional **JSON lines** (`logLine` with `{ t, payload }`) for events like `vellum_open`, `vellum_chain_ready`, `vellum_control`, `vellum_error` (`run-vellum-daemon.ts`).

**No** dedicated analytics SDKs in these trees (no Sentry/OpenTelemetry hooks found in `apps/atrium` / `apps/vellum`).

---

### 9. Email or notification features — what data?

**No email/SMS/push integrations** in `apps/atrium` or `apps/vellum`.

**In-app notifications**

- **Types** (`/Users/zach/Documents/dev/khora-labs/khora/packages/agent/relay/src/registration/notifications.ts`): `room_ticket`, `inbox_post`, `connection_request`, `host` — each carries structured `payload` / `payload: unknown` for generic kinds.
- **Delivery:** `createInboxWsHub()` + `deliverAgentNotification` when a buffer exists; **Atrium host does not pass `notificationBuffer`** into `AgentRelay` (`/Users/zach/Documents/dev/khora-labs/khora/packages/atrium/host/src/atrium-host.ts`), so persistence via `AgentNotificationBufferPort` is **not wired** there—live WS broadcast is used when the peer is connected (`rooms.ts`).
- **Post fan-out** writes Colonnade **cell inbox** rows with metadata including `postId`, `authorPrincipalId`, `reasons`, `createdAtMs`, `postKind` (`on-event.ts`).

---

### 10. What encryption is actually in use?

| Mechanism | Evidence |
| --- | --- |
| **Request integrity / auth** | **Ed25519** signatures over canonical `METHOD\nPATH\nts\nnonce\nsha256(body)` (`wire.ts`); verification in `strategy-did-key.ts`. This is **sign-then-send**, not payload encryption. |
| **Room WebSocket tickets** | **Signed/HMAC tickets** via `signRoomTicket` / `verifyRoomTicket` + secret in `rooms.pairing_secret_hex` (`hub.ts`, `frame-channel-sqlite.ts`). |
| **Transport TLS** | **Deployment-dependent.** Server builds `wss:` when request URL is `https:` (`webSocketBaseFromRequest` in `rooms.ts`). No custom TLS stack in app code. |
| **SQLite at rest** | Schemas use normal **`bun:sqlite`** files; **no application-layer SQLCipher / field encryption** documented in these paths. |
| **E2EE** | No claim of end-to-end encryption for post bodies or room frames in the reviewed server/daemon code; frames are **opaque blobs** to the relay but not described as client-encrypted payload.**

---

### Source map / catalog summary (quick index)

| `source_map_id` | Typical `entry_key` | Projection gist |
| --- | --- | --- |
| `relay:entity:profile` | profile id | `{ id, memoryId, bodyJson, updatedAtMs }` |
| `relay:entity:post` | post id | same + post index rows |
| `relay:entity:topic` | topic id | entity shape |
| `relay:reg:*` | did / profile id | registration links |
| `relay:subs:*` | did / subject string | subscription sets |
| `relay:social:*` | room id / did | social graph |
| `relay:inbox` | `did/roomId` | room ticket payload |
| `at2:room-registry` | room id | room metadata |
| `at2:room-invite` | sha256(joinToken) | invite consumption |
| `relay:social:username-to-principal` | normalized username | `{ principalId }` |
| `relay:social:principal-to-username` | did | `{ username }` |

All of the above is backed by the physical **`source_map_rows`** columns listed in **§1A**.