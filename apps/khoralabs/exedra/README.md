# Exedra

## Local development (full stack)

From this directory:

```sh
bun run dev
```

This starts:

| Service | URL |
| --- | --- |
| App | http://localhost:3000 |
| Authz | http://localhost:3001 |
| Chat | http://localhost:3002 |
| generate-response workflow | http://localhost:8120 |
| integrate-memory workflow | http://localhost:8121 |
| process-document workflow | http://localhost:8122 |

The script loads `app/.env`, `authz/.env`, `chat/.env`, and per-workflow `.env` files when present. It sets sensible defaults for local workflow, authz, and chat URLs.

Authz uses a local SQLite file at `app/data/authz.db` (no Turso required for local dev). For production authz, omit `AUTHZ_SQLITE_PATH` and configure Turso — see `authz/.env.example`.

Copy env templates before first run:

```sh
cp app/.env.example app/.env
cp authz/.env.example authz/.env
cp chat/.env.example chat/.env
```

You still need API keys in `app/.env` for features that call external services (e.g. `GOOGLE_GENERATIVE_AI_API_KEY`, document S3, registry).

Install dependencies from the repo root first: `bun install`.

## Individual services

See `app/README.md` and each workflow's README to run services separately.
