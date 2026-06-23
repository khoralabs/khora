# Facilitation Agent Workflow

Render Workflow that runs the facilitation agent when a participant completes their individual interview.

## Architecture

- **Exedra app** creates a `facilitation_event` job and dispatches `runFacilitationEvent` via Render SDK after interview completion
- **Facilitation thread** receives assistant posts for session facilitators (shared chat, separate from participant interviews)
- **This workflow** fetches participant context via Exedra internal API, runs `@khoralabs/exedra-facilitation-agent`, and POSTs the assistant message to `/internal/facilitation/threads/:threadId/messages`

## Local development

1. Set env on Exedra (`apps/khoralabs/exedra/app/.env`):

   ```
   EXEDRA_INTERNAL_TOKEN=dev-internal-token
   RENDER_API_KEY=...
   RENDER_FACILITATION_WORKFLOW_SLUG=facilitation-agent
   GOOGLE_GENERATIVE_AI_API_KEY=...
   ```

2. Set env on this workflow (`.env`):

   ```
   EXEDRA_INTERNAL_URL=http://localhost:3000
   EXEDRA_INTERNAL_TOKEN=dev-internal-token
   GOOGLE_GENERATIVE_AI_API_KEY=...
   ```

3. Start Exedra: `bun dev` (from app directory)

4. Start workflow task server:

   ```bash
   render workflows dev -- bun src/main.ts
   ```

5. Complete a participant interview — facilitation posts run asynchronously via workflow.

If `RENDER_FACILITATION_WORKFLOW_SLUG` is not set, Exedra runs facilitation events in-process (local dev without Render).

## Deploy (Render)

| Service | Root | Start command |
| --- | --- | --- |
| Exedra app | `apps/khoralabs/exedra/app` | `bun run start` |
| facilitation-agent workflow | `apps/khoralabs/exedra/workflows/facilitation-agent` | `bun src/main.ts` |

Wire `EXEDRA_INTERNAL_URL` on the workflow service to Exedra's internal hostname.
