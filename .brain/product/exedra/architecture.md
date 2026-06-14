# System Architecture

## Storage Layer

Three distinct SQLite databases, strictly separated:

| Database | Contents | Owner |
|---|---|---|
| `exedra.db` | App state: orgs, teams, sessions, invites, auth tokens, group chat messages | Exedra server |
| `memories/{userId}.db` | Personal memory namespace — user's beliefs, observations across all sessions | The individual user |
| `memories/{orgId}.db` | Org/team shared namespace — promoted facts, contention reports | The organization |

### Why Separate

- Simple structural queries (list sessions, check invite status) stay fast and relational without going through the memories graph
- Personal memories are independently portable — a user can download their `.db` file and run locally at any time
- Org memories can be self-hosted by a company on their own infra
- No cross-contamination between personal and shared knowledge

## Auth

Uses `@khoralabs/registry-auth` (Better Auth + email OTP) as the identity provider.

**For facilitators and team members (registered users):**
- OTP flow via `createRegistryEmailConfirmApi` (browser) → `POST /api/auth/email-otp/send-verification-otp` → `POST /api/auth/sign-in/email-otp`
- Sessions are signed HTTP-only cookies, verified via `verifyRegistrySession`
- React components from `@khoralabs/registry-accounts-react` (`useEmailConfirmFlow`, `EmailConfirm.*`) for OTP UI

**For stakeholder respondents (invite link):**
- Invite link contains a short-lived signed token scoped to the session
- On first use, the token is exchanged for a registry OTP flow — every respondent gets a registry account (email already confirmed via OTP at zero marginal cost)
- Subsequent visits use the registry session cookie
- Their registry account is the stable identity anchor for personal memories and future DID linking

**DID linking (v1.5+):**
- `POST /agent/auth` + `POST /agent/auth/claim/complete` on the registry handles OTP → agent DID linking
- `linkAgentToMembership` from `@khoralabs/registry-accounts` links the DID to their account

**Key env vars:** `BETTER_AUTH_SECRET`, `REGISTRY_URL`, `REGISTRY_DATABASE_PATH`, `SES_FROM_ADDRESS`

**Reference:** `apps/khoralabs/homepage` for external SPA + registry IdP pattern; `apps/khora/registry` for full bootstrap.

## Server Structure

Single `Bun.serve()` app (mirrors `apps/khoralabs/homepage` pattern):

```
Bun.serve({
  routes: {
    "/api/*"   → API handlers (sessions, teams, invites, jobs)
    "/ws"      → WebSocket upgrade (interview + alignment chat)
    "/api/auth/*" → registry auth proxy (Better Auth endpoints)
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

**Registry auth:** browser talks directly to the registry URL (`REGISTRY_URL`) via `credentials: "include"` — not proxied through Exedra. Same pattern as homepage.

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

| Phase | What's added | Khora dependency |
|---|---|---|
| v1 | Email magic links, WebSocket group chat | None |
| v1.5 | Optional DID creation for users (`did:key` via `@khoralabs/khora-auth`) | Identity only — no network calls |
| v2 | Invite delivery via Khora inbox (email fallback) | Single `POST /v1/posts` to Khora host |
| v2+ | Alignment group chat → Khora room; alignment agent subscribes with its own DID | Full Khora participation |

**Key invariant:** user/org IDs are DID-compatible from day one. In standalone mode `userId` is a UUID; in Khora mode it's the `did:key`. The memories namespace key is always this same field — no re-keying required.

**Long-term:** In the Khora-native version, the alignment agent is a deployable Khora agent (registered with its own DID on a Khora host) — not an Exedra application feature. Exedra provisions and operates it custodially; orgs can self-host it. The alignment group chat is a Khora room visible in any Khora-compatible client.

## Deployment Targets

- **Custodial (default):** Exedra hosts all three DBs; user/org can export at any time
- **Self-hosted org:** Company runs Exedra server with their own `{orgId}.db`; personal DBs remain custodial or local
- **Fully local:** User runs Exedra locally; all three DBs on their machine
