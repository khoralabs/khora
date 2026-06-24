# Exedra App

Install dependencies from the repo root:

```sh
bun install
```

## Local Development

The fastest way to run everything locally (app, authz, and all workflows):

```sh
cd apps/khoralabs/exedra
bun run dev
```

See [../README.md](../README.md) for ports and env setup.

### App + generate-response only

If you only need chat, start the local Render task server first:

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
```

The task server is expected to be running when the dev server dispatches an assistant response. If it is down or the Render env is missing, chat dispatch fails clearly instead of falling back to legacy agents.
