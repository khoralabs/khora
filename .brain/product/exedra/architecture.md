# System Architecture

## Storage Layer

App state and memories persistence are strictly separated:

| Store | Contents | Owner |
|---|---|---|
| `exedra.db` (app data dir) | App state: orgs, teams, sessions, invites, auth tokens, group chat messages | Exedra app |
| Knowledge service SQLite (`{EXEDRA_KNOWLEDGE_DATA_DIR}/v1/…`) | Org and account memory graphs — beliefs, observations, promoted facts | Knowledge service (`@khoralabs/exedra-knowledge`) |

Memory databases are keyed logically as `{ kind: "organization" \| "account", ownerKey: did }`. On disk each database is a single file:

```
{EXEDRA_KNOWLEDGE_DATA_DIR}/v1/{base64url(JSON.stringify([kind, ownerKey]))}/database.db
```

Org databases hold shared team namespaces; account databases hold personal namespaces across all sessions.

### Why Separate

- Simple structural queries (list sessions, check invite status) stay fast and relational without going through the memories graph
- Personal memories are independently portable — a user can download their `.db` file and run locally at any time
- Org memories can be self-hosted by a company on their own infra
- No cross-contamination between personal and shared knowledge

## Auth

Uses `@khoralabs/registry-auth` (Better Auth + email OTP) as the identity provider — same pattern as `apps/khoralabs/homepage`.

**All participants (facilitators and invitees):**
- OTP flow via `createRegistryEmailConfirmApi` (browser → registry `/api/auth/*` with `credentials: "include"`)
- React UI via `@khoralabs/registry-accounts-react` (`EmailConfirm.*`) and Exedra `SignIn` component
- Server session check: `GET /api/auth/session` forwards cookies to registry via `verifyRegistrySession`

**Invite deep links (not magic auth):**
- Facilitator sends a URL like `/invite/{token}` — a normal deep link into Exedra
- Invitee lands on the invite page; if not authenticated, they complete the same registry OTP flow
- After OTP, `POST /api/invites/{token}/accept` binds the invite to their registry account and redirects into the session
- Every invitee gets a registry account (stable identity for personal memories)

**Key env vars:** `BUN_PUBLIC_KHORA_REGISTRY_URL`, `REGISTRY_URL` (server-side session verify)

**Reference:** `apps/khoralabs/homepage` for client OTP pattern; `apps/exedra/src/server/auth/` for session API.

## Onboarding

Facilitators without a `team_members` row complete a three-step wizard (org → team → invite team) gated by `GET /api/me` (`onboardingRequired`). See [onboarding.md](./onboarding.md).

On step 2 submit, `POST /api/onboarding` creates relational org/team records and bootstraps memories scope chains via `server/memories/bootstrap.ts`.

## Memories module (`server/memories/`)

The app does **not** open memory SQLite files locally. It calls the knowledge service over HTTP via `@khoralabs/memories-service-client` (`service-client.ts`), using `EXEDRA_KNOWLEDGE_SERVICE_URL` and optional `EXEDRA_KNOWLEDGE_SERVICE_TOKEN`.

| Database id | Purpose |
|---|---|
| `{ kind: "organization", ownerKey: orgDid }` | Shared org/team namespaces |
| `{ kind: "account", ownerKey: accountDid }` | Account personal namespace |

User IDs stay as DIDs in app tables. For memories **namespace path segments** inside a database only, Exedra encodes principals with `encodePrincipalIdForMemories` (22-char SHA256 base64url) — this is unrelated to on-disk database path encoding.

S3 object layout for uploads uses principal folders under `exedra/` (via `server/storage/`):

| Prefix | Purpose |
|---|---|
| `organizations/{orgDid}/files/...` | Org-owned uploads (avatars, documents) |
| `accounts/{accountDid}/files/...` | Account-owned uploads (avatars, documents) |

The knowledge service hosts SQLite under `{EXEDRA_KNOWLEDGE_DATA_DIR}` with `EXEDRA_KNOWLEDGE_SQLCIPHER_KEY`. Optional `SQLITE_CUSTOM_LIB` on the knowledge service for sqlite-vec (Homebrew sqlite).

Scope chains created at onboarding:

```
# org DB
_global_ → _global_/org/{orgId} → _global_/org/{orgId}/team/{teamId}

# user DB
_global_ → _global_/{encodedUserId} → _global_/{encodedUserId}/org/{orgId}/team/{teamId}
```

## Server Structure

Single `Bun.serve()` app (mirrors `apps/khoralabs/homepage` pattern):

```
Bun.serve({
  routes: {
    "/api/*"   → API handlers (sessions, teams, invites, jobs)
    "/ws"      → WebSocket upgrade (interview + alignment chat)
    "/api/auth/session" → verify registry session (cookie forwarded to registry)
    "/api/invites/:token" → public invite metadata for deep links
    "/api/invites/:token/accept" → accept invite (requires registry session)
    "/__ssr-shell/*" → internal HTML bundle shells (not user-facing)
    "/*"       → ssrRoute() — React SSR with hydration
  },
  development: { hmr: true }  // dev only
})
```

**SSR pattern** (from homepage `render-html-route.tsx`):
1. Server fetches the HTML shell from `/__ssr-shell/*` (same process)
2. Renders the React page with `renderToReadableStream`
3. Injects SSR markup into `<div id="root">`
4. Client detects pre-rendered children → `hydrateRoot` instead of `createRoot`

**HTML imports:** each page route has an `index.html` + `client.tsx`; Bun's bundler handles React + Tailwind transpilation automatically.

**Registry auth:** browser OTP goes directly to the registry (`BUN_PUBLIC_KHORA_REGISTRY_URL`); Exedra server verifies sessions by forwarding cookies to registry (`REGISTRY_URL`). Register Exedra's origin as a registry trusted origin for CORS.

## Agent & LLM Stack

| Layer | Choice | Notes |
|---|---|---|
| LLM streaming | Vercel AI SDK (`ai` package) | `streamText` for interview turns; tool calls for belief flagging |
| LLM provider | OpenAI (`gpt-4o`) default | Configurable via `AI_PROVIDER` / `AI_API_KEY` env vars; any OpenAI-compatible endpoint (Anthropic, Ollama, etc.) via Vercel AI SDK provider swap |
| Chat UI | Vercel AI SDK `useChat` hook | Client-side message state + streaming; interview and group chat interfaces |
| Bot delivery | Vercel Chat SDK (`chat` package) | Optional: Slack/Teams/Discord adapter for alignment group chat |
| App state | `bun:sqlite` | Sessions, teams, orgs, invites, interview transcripts, group chat messages |
| Agent memory | `@khoralabs/memories-service` (HTTP) | Knowledge service hosts per-org/per-account SQLite; app/workflows are clients |

Rationale: keeps everything self-hostable in a single container. Vercel Chat SDK also opens a future path for `@mention` integration with other apps.

## WebSocket Transport

`Bun.serve()` native WebSockets handle all real-time communication:

- **Interview session:** bidirectional — user sends a message, server streams the AI response back turn by turn
- **Alignment group chat:** multi-party — messages broadcast to all participants in the chat room
- Single unified transport for both use cases

## Per-User/Per-Org Memory Access Pattern

The app caches remote clients, not local SQLite handles:

- `service-client.ts` keeps a `Map` of in-flight `openOrgMemoriesService` / `openUserMemoriesService` promises keyed by `{ kind, ownerKey }`
- Each open links the Exedra ontology and returns HTTP-backed `RemoteMemoriesClientAsync` handles
- The knowledge service opens and caches SQLite files under `{EXEDRA_KNOWLEDGE_DATA_DIR}/v1/…`

Key files:
- `app/src/server/memories/service-client.ts` — app-side client cache
- `knowledge/src/server.ts` — `createLocalSqliteServiceStack` host

## Backup Strategy (Litestream)

Mirrors the Khora host pattern from `@khoralabs/khora` (`scripts/litestream-config.ts` + `start-exedra.ts`):

- `exedra.db` — replicated as a single file: `s3://{bucket}/{prefix}/exedra.sqlite`
- Knowledge databases — **not yet backed up by the app**; live under `{EXEDRA_KNOWLEDGE_DATA_DIR}/v1/*/database.db` on the knowledge service host. A future Litestream sidecar on the knowledge service would watch that tree separately.
- Config is generated at runtime (temp YAML file), not checked in
- Litestream runs as a sidecar process alongside the Exedra app; `EXEDRA_LITESTREAM=1` to enable
- MinIO for local dev; AWS S3 for prod

### Relevant env vars

| Var | Purpose |
|---|---|
| `LITESTREAM_S3_BUCKET` | S3 bucket |
| `LITESTREAM_S3_KEY_PREFIX` | Path prefix in bucket |
| `LITESTREAM_S3_REGION` | AWS region |
| `LITESTREAM_S3_ENDPOINT` | MinIO endpoint (local dev only) |
| `EXEDRA_LITESTREAM` | `1` to enable Litestream sidecar |

## Khora Network Adoption Path

Exedra ships standalone. Khora networking is progressively enabled without a breaking migration.

| Phase | Transport | Auth | Identity | Khora dep |
|---|---|---|---|---|
| v1 (now) | Bun WS | Registry OTP | `did:key` minted at invite accept, stored custodially | None |
| v2 | Bun WS | Registry OTP | DID + registry link (`/v1/link/agent`) | `@khoralabs/khora-auth` link API |
| v3 | Exedra → relay (proxied) | Registry OTP → custodial signer | Custodial agent on exedra-host | `@khoralabs/khora-host` + relay |
| v4 | Direct relay | DID-signed WS | Sovereign user, own device | Full Khora participation |

**Key invariant:** `users.id` is a `did:key` from day one. The memories namespace key is always this field — no re-keying required when moving to Khora-native transport.

**Long-term:** In the Khora-native version, the alignment agent is a deployable Khora agent (registered with its own DID on a Khora host) — not an Exedra application feature. Exedra provisions and operates it custodially; orgs can self-host it. The alignment group chat is a Khora room visible in any Khora-compatible client.

### Sovereign cutover (v3 → v4)

What changes when a user moves from custodial (Exedra-held keys) to sovereign (own device):

| Concern | Custodial (v1–v3) | Sovereign (v4) |
|---|---|---|
| Key custody | `users.identity_encrypted` on Exedra server | User device / agent keychain |
| Interview transport | Exedra Bun WS | Relay channel multiplex (direct attach) |
| Session invites | Exedra single-use deep links | Relay join tokens via Khora inbox |
| Registry link | Optional until v2 | Required (`account_agent_links`) |

What is preserved across cutover:

- **DID** — stable; no memories re-keying
- **Session history** — `messages` rows are portable `UIMessage` JSON (JSONB)
- **Personal memories** — same `{ kind: "account", ownerKey: did }` database id; knowledge service on-disk encoding is versioned under `v1/`

Research on low-complexity Khora-native web apps: [`.brain/research/khora-native-apps.md`](../../research/khora-native-apps.md).

## Deployment Targets

- **Custodial (default):** Exedra app + knowledge service hosted together; user/org can export knowledge DB files from the service data dir
- **Self-hosted org:** Company runs Exedra + knowledge service with their org database; personal DBs remain custodial or local
- **Fully local:** User runs the Exedra dev stack (`bun run dev`); `exedra.db` and knowledge data under the configured data dirs
