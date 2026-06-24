# System Architecture

## Storage Layer

Three distinct SQLite databases, strictly separated:

| Database | Contents | Owner |
|---|---|---|
| `exedra.db` | App state: orgs, teams, sessions, invites, auth tokens, group chat messages | Exedra server |
| `memories/organizations/{orgDid}/{orgDid}.db` | Org/team shared namespace — promoted facts, contention reports | The organization |
| `memories/accounts/{accountDid}/{accountDid}.db` | Personal memory namespace — user's beliefs, observations across all sessions | The individual user |

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

Separate SQLite files under `{EXEDRA_DATA_DIR}/memories/`:

| File | Purpose |
|---|---|
| `organizations/{orgDid}/{orgDid}.db` | Shared org/team namespaces |
| `accounts/{accountDid}/{accountDid}.db` | Account personal namespace |

User IDs stay as DIDs in app tables. For memories **namespace path segments** only, Exedra encodes principals with `encodePrincipalIdForMemories` (22-char SHA256 base64url).

S3 object layout mirrors the same principal folders under `exedra/`:

| Prefix | Purpose |
|---|---|
| `organizations/{orgDid}/{orgDid}.db*` | Litestream memory DB replicas |
| `organizations/{orgDid}/files/...` | Org-owned uploads (avatars, documents, knowledge) |
| `accounts/{accountDid}/{accountDid}.db*` | Litestream memory DB replicas |
| `accounts/{accountDid}/files/...` | Account-owned uploads (avatars, knowledge) |

Path builders live in `server/storage/`; documents and avatars delegate to that module.

Opened via lazy `Map` cache in `store.ts`; requires `EXEDRA_MEMORIES_SQLCIPHER_KEY`. Optional `SQLITE_CUSTOM_LIB` for sqlite-vec (Homebrew sqlite).

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
| Agent memory | `@khoralabs/memories-sqlite` | Per-user and per-org SQLite files, separate from app state |

Rationale: keeps everything self-hostable in a single container. Vercel Chat SDK also opens a future path for `@mention` integration with other apps.

## WebSocket Transport

`Bun.serve()` native WebSockets handle all real-time communication:

- **Interview session:** bidirectional — user sends a message, server streams the AI response back turn by turn
- **Alignment group chat:** multi-party — messages broadcast to all participants in the chat room
- Single unified transport for both use cases

## Per-User/Per-Org File Access Pattern

Mirrors Colonnade's `per_principal` mode (`@khoralabs/colonnade-persistence`):

- A `Map<userId, MemoriesPersistence>` holds open database handles for the process lifetime
- On first access for a user, open `memories/{userId}.db` (create if missing), run schema migrations, cache the handle
- Same pattern for `memories/{orgId}.db`
- `close()` on SIGTERM/SIGINT closes all open handles

```typescript
// Pseudocode — mirrors cluster.resolveCell()
function resolveUserMemories(userId: string): MemoriesPersistence {
  if (!cache.has(userId)) {
    const db = openDatabase(`memories/${userId}.db`, { create: true });
    cache.set(userId, createMemoriesPersistence(db));
  }
  return cache.get(userId)!;
}
```

Key files to reference:
- `packages/colonnade/impl/ts/src/sqlite/cluster.ts` — lazy open pattern
- `packages/colonnade/impl/ts/src/sqlite/sqlite-pragmas.ts` — WAL/performance pragmas to apply on open

## Backup Strategy (Litestream)

Mirrors the Khora host pattern from `@khoralabs/khora` (`scripts/litestream-config.ts` + `start-khora.ts`):

- `exedra.db` — replicated as a single file: `s3://{bucket}/{prefix}/exedra.sqlite`
- `memories/` directory — directory-mode watcher: `dir: memories/, pattern: *.db, watch: true` → `s3://{bucket}/{prefix}/memories/`
  - `watch: true` picks up new per-user and per-org `.db` files automatically as they are created
- Config is generated at runtime (temp YAML file), not checked in
- Litestream runs as a sidecar process alongside the Bun server; `EXEDRA_LITESTREAM=1` to enable
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
- **Personal memories** — `memories/{did}.db` paths unchanged

Research on low-complexity Khora-native web apps: [`.brain/research/khora-native-apps.md`](../../research/khora-native-apps.md).

## Deployment Targets

- **Custodial (default):** Exedra hosts all three DBs; user/org can export at any time
- **Self-hosted org:** Company runs Exedra server with their own `{orgId}.db`; personal DBs remain custodial or local
- **Fully local:** User runs Exedra locally; all three DBs on their machine
