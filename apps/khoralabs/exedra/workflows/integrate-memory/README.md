# Integrate Memory Workflow

Render Workflow that integrates confirmed/corrected Exedra beliefs into the user's memories graph.

## Architecture

- **Exedra app** dispatches `integrateBelief` tasks via Render SDK on belief PATCH
- **This workflow** runs real `MemoryAdapterClient` / `MemoryIntegratorClient` agent sessions (with `memory_search` tool loops)
- **HTTP RPC client** (`ExedraHttpMemoriesClientAsync`) forwards `MemoriesClientAsync.search()` and provenance reads to Exedra internal API
- **Exedra internal API** handles agent search RPC, preflight search, and merge (write)
- **Ontology** — homogeneous `memory` nodes with salience `features`; semantic `related` edges (integrator); deterministic `retrieval_autolink` edges (autolink on merge)
- **Cold start** (empty memories DB): adapter → bootstrap merge with `memory` label + autolink (no neighbors); integrator skipped
- **Warm path** (existing neighbors): adapter + integrator `related` edges → merge adds autolink top-K from hybrid search
- **OTel** via `@khoralabs/agent-capabilities-otel` + `@khoralabs/observability` (optional OTLP export)

## Local development

1. Set env on Exedra (`apps/khoralabs/exedra/app/.env`):

   ```
   EXEDRA_INTERNAL_TOKEN=dev-internal-token
   RENDER_API_KEY=...
   RENDER_WORKFLOW_SLUG=integrate-memory
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

5. Confirm beliefs in the interview UI — integration runs asynchronously via workflow.

## Deploy (Render)

| Service | Root | Start command |
| --- | --- | --- |
| Exedra app | `apps/khoralabs/exedra/app` | `bun run start` |
| integrate-memory workflow | `apps/khoralabs/exedra/workflows/integrate-memory` | `bun src/main.ts` |

Wire `EXEDRA_INTERNAL_URL` on the workflow service to Exedra's internal hostname.
