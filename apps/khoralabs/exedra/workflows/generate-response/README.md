# Generate Response Workflow

Generic Render workflow for generating Exedra interview, facilitation, and thread summary agent responses.

## Task

- `generateAgentResponse`: accepts `GenerateResponseWorkflowParams` and returns `GenerateResponseResult`.
- The workflow builds an agent-capabilities identity, evaluates authz-backed policies, captures the enabled tools, streams through the AI SDK, and writes chat deltas through Exedra's authenticated internal chat API.

Callers should import the request/result contract from this package:

```ts
import type {
  GenerateResponseResult,
  GenerateResponseWorkflowParams,
} from "@khoralabs/exedra-workflows-generate-response/generate-response-workflow";
```

## Environment

- `RENDER_API_KEY=`
- `EXEDRA_INTERNAL_URL=`
- `EXEDRA_INTERNAL_TOKEN=`
- `AI_GATEWAY_API_KEY=`
- `GENERATE_RESPONSE_DEFAULT_MODEL=` optional fallback when callers omit a model id

Gateway model ids are passed through from `params.model.id`, for example `anthropic/claude-sonnet-4.6`, `google/gemini-2.5-flash`, or `openai/gpt-4.1`.

## Development

Run tests without live Gateway access:

```sh
bun test
```

Run the workflow task server from this directory:

```sh
bun run dev
```

This starts Render's local task server, usually on `http://localhost:8120`, and registers `generateAgentResponse`.

### With The Exedra App

In `apps/khoralabs/exedra/app/.env`, set:

```sh
EXEDRA_INTERNAL_TOKEN=dev-internal-token
RENDER_API_KEY=local-dev-token
RENDER_USE_LOCAL_DEV=true
RENDER_LOCAL_DEV_URL=http://localhost:8120
RENDER_GENERATE_RESPONSE_WORKFLOW_SLUG=generate-response
```

In `apps/khoralabs/exedra/workflows/generate-response/.env`, set:

```sh
EXEDRA_INTERNAL_URL=http://localhost:3000
EXEDRA_INTERNAL_TOKEN=dev-internal-token
AI_GATEWAY_API_KEY=...
```

Then run both processes:

```sh
# Terminal 1
cd apps/khoralabs/exedra/app
bun run dev

# Terminal 2
cd apps/khoralabs/exedra/workflows/generate-response
bun run dev
```

The Exedra app dispatches this workflow for interview and facilitator chat. Manual triggers require the target chat thread to exist in the Exedra app chat service and the app to expose the internal authz, memory, and chat endpoints used by this workflow.

```sh
render workflows tasks start generateAgentResponse --local --input='[
  {
    "responseId": "local-response-1",
    "agent": {
      "id": "local-generate-response-agent",
      "name": "Generate Response Agent",
      "actingFor": { "type": "agent", "id": "local-generate-response-agent" }
    },
    "model": {
      "id": "anthropic/claude-sonnet-4.6",
      "maxSteps": 3
    },
    "context": {
      "sessionId": "local-session",
      "threadId": "local-thread",
      "messages": [
        {
          "id": "local-user-message",
          "role": "user",
          "parts": [{ "type": "text", "text": "Summarize this thread." }]
        }
      ],
      "directives": {
        "skillNames": ["summarize-thread"],
        "instructions": ["Keep the summary concise."]
      }
    },
    "access": {
      "memoryNamespaces": [],
      "chatThread": { "threadId": "local-thread", "write": true }
    },
    "output": {
      "mode": "summary",
      "chat": {
        "threadId": "local-thread",
        "postId": "local-response-1",
        "streamDeltas": true
      }
    }
  }
]'
```
For non-default local task server ports, start with `render workflows dev --port 8121 -- bun src/main.ts` and set `RENDER_LOCAL_DEV_URL=http://localhost:8121` in the app.

## Non-Goals

- Do not call legacy interview or facilitation writeback endpoints.
- Do not add thread-query tools; callers provide messages and the agent reads authorized memories.
