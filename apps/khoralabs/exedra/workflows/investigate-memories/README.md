# Investigate Memories Workflow

Render Workflow that runs the memory investigator agent for graph UI deep search.

## Architecture

- **Exedra app** creates a `memory_investigation` job and dispatches `investigateMemory` tasks via Render SDK on `POST /investigate`
- **Client** receives `{ jobId }` (HTTP 202) and streams progress via SSE at `GET /api/jobs/:jobId/stream`
- **This workflow** runs `MemoryInvestigatorClient` with `memory_search` tool loops and POSTs events to `/internal/jobs/:jobId/events`
- **HTTP RPC client** (`ExedraHttpMemoriesClientAsync`) forwards search and provenance reads to Exedra internal API

## Local development

1. Set env on Exedra (`apps/khoralabs/exedra/app/.env`):

   ```
   EXEDRA_INTERNAL_TOKEN=dev-internal-token
   RENDER_API_KEY=...
   RENDER_INVESTIGATION_WORKFLOW_SLUG=investigate-memories
   ```

2. Set env on this workflow (`.env`):

   ```
   RENDER_API_KEY=...
   EXEDRA_INTERNAL_URL=http://localhost:3000
   EXEDRA_INTERNAL_TOKEN=dev-internal-token
   GOOGLE_GENERATIVE_AI_API_KEY=...
   ```

3. Start Exedra: `bun dev` (from app directory)

4. Start workflow task server:

   ```bash
   render workflows dev -- bun src/main.ts
   ```

5. Use deep search in the graph UI — investigation runs via workflow with SSE progress.

If `RENDER_INVESTIGATION_WORKFLOW_SLUG` is not set, Exedra falls back to in-process investigation (same job + SSE API).

## Deploy (Render)

| Service | Root | Start command |
| --- | --- | --- |
| Exedra app | `apps/khoralabs/exedra/app` | `bun run start` |
| investigate-memories workflow | `apps/khoralabs/exedra/workflows/investigate-memories` | `bun src/main.ts` |

Wire `EXEDRA_INTERNAL_URL` on the workflow service to Exedra's internal hostname.
