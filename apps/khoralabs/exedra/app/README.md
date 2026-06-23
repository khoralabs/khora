# Exedra App

Install dependencies from the repo root:

```sh
bun install
```

## Local Development

The interview and facilitator chat surfaces use `@khoralabs/chat-react`, the app chat API, a separate chat SQLite database, and the `generate-response` Render workflow.

Start the local Render task server first:

```sh
cd apps/khoralabs/exedra/workflows/generate-response
bun run dev
```

Then start the Exedra app:

```sh
cd apps/khoralabs/exedra/app
bun run dev
```

Recommended local env:

```sh
RENDER_USE_LOCAL_DEV=true
RENDER_LOCAL_DEV_URL=http://localhost:8120
RENDER_GENERATE_RESPONSE_WORKFLOW_SLUG=generate-response
EXEDRA_CHAT_DB_PATH=./data/exedra-chat.db
GENERATE_RESPONSE_CHAT_SQLITE_PATH=./data/exedra-chat.db
```

The task server is expected to be running when the dev server dispatches an assistant response. If it is down or the Render env is missing, chat dispatch fails clearly instead of falling back to legacy agents.
