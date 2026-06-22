# Interview Turn Workflow

Render Workflow that runs the interview agent turn (RAG prefetch, streaming LLM, tools) outside the Exedra app process.

## Architecture

- **Exedra app** persists the user message, creates an `interview_turn` job, and dispatches `runInterviewTurn` via Render SDK
- **WebSocket** on the app relays turn events posted by the workflow through `/internal/interview/turns/:turnId/events`
- **This workflow** fetches turn context and RAG via Exedra internal API, runs `runInterviewTurn`, and POSTs completion to `/internal/interview/turns/:turnId/complete`
- Turns continue if the client disconnects; reconnect loads messages from REST bootstrap

## Local development

Set on Exedra (`apps/khoralabs/exedra/app/.env`):

```
EXEDRA_INTERNAL_TOKEN=dev-internal-token
RENDER_API_KEY=...
RENDER_INTERVIEW_TURN_WORKFLOW_SLUG=interview-turn
AI_API_KEY=...
```

Set on this workflow:

```
EXEDRA_INTERNAL_URL=http://localhost:3000
EXEDRA_INTERNAL_TOKEN=dev-internal-token
AI_API_KEY=...
```

Start workflow: `render workflows dev -- bun src/main.ts`

If `RENDER_INTERVIEW_TURN_WORKFLOW_SLUG` is not set, Exedra runs interview turns in-process (local dev without Render).
