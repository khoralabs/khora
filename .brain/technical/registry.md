# Registry — Internal Architecture

The registry (`apps/khoralabs/registry`) is a thin **orchestration layer** over two packages:

| Layer | Path | Role |
|-------|------|------|
| **Registry app** | `apps/khoralabs/registry` | `Bun.serve` routing, CORS, admin SPA, rate limits, health poller, workflow glue |
| **users-auth** | `packages/khoralabs/users-auth` | Better Auth config, `/api/auth`, sessions, OTP email, schema bootstrap |
| **users** | `packages/khoralabs/users` | Domain schema + all SQLite CRUD |

**Single database:** encrypted SQLite at `REGISTRY_DATABASE_PATH` (default `data/registry.sqlite`), opened via `getUsersDatabase()`. All three layers share the same connection.

---

## Authentication

Better Auth with `emailOTP` plugin. Flow:

```
Client → POST /api/auth/email-otp/...
  → on user/session create hooks → linkBetterAuthUser
  → domain accounts + auth_links
  
Registry routes: getRegistrySession(req) → findAccountByAuthSubject(db, session.user.id)
```

**users-auth owns:** `createRegistryAuth`, email OTP, Better Auth table migrations, `getRegistrySession`  
**users owns:** `linkBetterAuthUser`, `auth_links`, `accounts` / `account_emails`

---

## Domain inventory

### Accounts
No account CRUD in registry app — users owns schema (`accounts`, `account_emails`, `auth_links`), `findAccountBy*`, `linkBetterAuthUser`. Registry exposes data via `/v1/me` and admin lookup.

### Hosts catalog

**Registration flows:**
1. **Self-serve:** `POST /v1/hosts/register` → `registerKhoraHost` → optional auto-activate + health probe → returns `registrationSecret` / `managementToken`
2. **Claim:** `GET|POST /v1/hosts/:slug/registration` with bearer secret
3. **Operator activate:** `POST /admin/api/hosts/:id/activate` (console token) or internal API
4. **Catalog:** `GET /v1/hosts`, `GET /v1/hosts/:slug` (active/public only)

**Delegated to hosts:** Invite minting and consumption happen on `khora-server`. Registry never holds invite plaintext or `KHORA_INVITE_PEPPER`.

### Membership
`memberships` table with statuses: `requested` / `approved` / `active` / `revoked`. Membership rows are created when an agent links to an account on a host — not during marketing signup.

### Marketing consents
`POST|DELETE /v1/marketing/subscribe` → `marketing_consents` CRUD. Homepage `/join` may subscribe users to `khora-waitlist` after OTP signup. Consent tracking only — not a waitlist queue.

### Agent links (CLI / DID)

**Flows:**
- **Device + browser link:** `POST /v1/device/authorize` → user opens `/cli/link?user_code=...` → logged-in user approves → CLI polls for token (OAuth device-code style)
- **Agent link:** `GET /v1/link/challenge?did=` → signed `POST /v1/link/agent` (session + challenge) → `linkAgentToAccountOnHost`
- **Status/unlink:** `GET /v1/link/status`, `DELETE /v1/link/agent`

### Trusted origins

**Rules:** Only active hosts with `registry_participation_enabled` and at least one row in `host_trusted_origins` contribute to registry CORS and Better Auth `trustedOrigins`. Host `base_url` is **not** auto-trusted unless explicitly registered.

Flow: Host operator → management token → `POST /v1/hosts/:slug/registry/origin-requests` → admin approves → `reloadRegistryAuth` refreshes CORS + Better Auth.

---

## HTTP surface (by prefix)

| Prefix | Auth | Purpose |
|--------|------|---------|
| `/api/auth/*` | Better Auth | Sign-in, sessions, OTP |
| `/v1/me` | Session | Account, memberships, access requests, marketing |
| `/v1/hosts*` | Public / mgmt token / secret | Catalog, register, registry participation |
| `/v1/access-token/request` | None (opaque) | Waitlist enqueue |
| `/v1/device/*`, `/v1/link/*` | Device code / session / agent sig | CLI linking |
| `/v1/marketing/*` | None | List subscribe/unsubscribe |
| `/admin/api/*` | `REGISTRY_CONSOLE_ROOT_TOKEN` | Operator console API |
| `/internal/admin/*`, `/internal/v1/hosts*` | `REGISTRY_INTERNAL_SECRET` | Machine admin |
| `/admin`, `/cli/link` | Static SPA | Operator UI, link UX |

---

## What registry does NOT own

- Per-host runtime auth, invites DB, or agent execution (that's `khora-server`)
- Invite token plaintext / pepper (host only)
- Better Auth table definitions (generated migrations in users-auth)

---

## Package file map

**Registry app:**
- `src/index.ts` — route table
- `src/api/*.ts` — HTTP handlers
- `src/workflows/access-token.ts` — waitlist → invite request
- `src/trusted-origins.ts`, `src/cors.ts`
- `src/host-health.ts` — background health probes

**users package:**
- `src/schema-sql.ts` — all domain tables
- `src/accounts.ts`, `memberships.ts`, `membership-invites.ts`, `access-token-requests.ts`
- `src/khora-hosts.ts`, `host-trusted-origins.ts`
- `src/account-agent-links.ts`, `device-authorizations.ts`, `marketing-consents.ts`
- `src/admin-stats.ts`

**users-auth package:**
- `src/auth-config.ts`, `auth.ts`, `session.ts`, `ensure-schema.ts`
- `src/client.ts`, `email-confirm/registry-api.ts`
- `src/db.ts` — alias to users DB

---

## Primary cross-app data flows

1. **Waitlist:** `khoralabs/homepage` → `/v1/access-token/request` → admin approve → khora-server poller → `/invite-mint-jobs/.../complete`
2. **Sign-in:** homepage/admin → `/api/auth` OTP → account link → `/v1/me` or device/link flows
3. **Host joins registry:** khora-server registers, sets trusted origins via `/registry` API, enables participation → origins flow into registry CORS + Better Auth
4. **CLI identity:** device auth or link challenge → registry session cookie / agent bindings stored in shared SQLite
