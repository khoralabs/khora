# @khoralabs/exedra-knowledge

Standalone Exedra service that hosts [`@khoralabs/memories-service`](../../../../vendor/memories/packages/memories-service/) over HTTP.

The app and workflows connect as clients via `EXEDRA_KNOWLEDGE_SERVICE_URL` and `@khoralabs/memories-service-client`. Namespace authorization, embeddings, and merge orchestration stay in the Exedra app.

## Local development

Started automatically by the Exedra dev stack:

```bash
cd apps/khoralabs/exedra
bun run dev
```

Knowledge service listens on **http://localhost:3003** by default.

## Standalone

```bash
cp .env.example .env
bun run start
```

## Environment

| Variable | Purpose |
|----------|---------|
| `PORT` | Listen port (default `3003`) |
| `EXEDRA_KNOWLEDGE_DATA_DIR` | SQLite data root (default `{EXEDRA_DATA_DIR}/knowledge`) |
| `EXEDRA_KNOWLEDGE_SQLCIPHER_KEY` | SQLCipher key (required) |
| `MEMORIES_SERVICE_AUTH` | `none` or `server-admin` |
| `MEMORIES_SERVICE_ADMIN_TOKEN` | Bearer token when using `server-admin` |
| `SQLITE_CUSTOM_LIB` | System libsqlite3 with extension loading (required for sqlite-vec) |

App and workflows use:

- `EXEDRA_KNOWLEDGE_SERVICE_URL`
- `EXEDRA_KNOWLEDGE_SERVICE_TOKEN`

## On-disk layout

Each memory database is stored as a single SQLCipher file:

```
{EXEDRA_KNOWLEDGE_DATA_DIR}/v1/{base64url(JSON.stringify([kind, ownerKey]))}/database.db
```

Placement and ontology registries live under `{EXEDRA_KNOWLEDGE_DATA_DIR}/registry/`.

## Tests

```bash
bun test
```

For app integration tests, use `setupTestKnowledgeService` from `@khoralabs/exedra-knowledge/test-server` (re-exported in the app as `test-knowledge-service.ts`).
