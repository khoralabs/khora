# PostgreSQL for Umami (local dev)

Local Postgres instance for running Umami analytics. **Production uses Render Managed PostgreSQL**, not this image.

## Build

Use the **repository root** as the build context:

```sh
docker build -t khora-postgres -f apps/postgres/Dockerfile .
```

## Run (local dev)

```sh
docker run -d --name khora-postgres \
  -p 5432:5432 \
  -v khora-postgres-data:/var/lib/postgresql/data \
  khora-postgres
```

Default credentials (local only — change in production):

| Variable | Value |
| --- | --- |
| `POSTGRES_USER` | `umami` |
| `POSTGRES_PASSWORD` | `umami` |
| `POSTGRES_DB` | `umami` |

Connection string: `postgresql://umami:umami@localhost:5432/umami`

## Render (production)

Use **Render Managed PostgreSQL** instead of this container. Render Managed PG provides automated backups, connection pooling, and point-in-time recovery.

1. In the Render dashboard, create a new **PostgreSQL** database.
2. Copy the **Internal Database URL** (e.g. `postgresql://umami:...@dpg-.../umami`).
3. Set that URL as `DATABASE_URL` on the Umami service (see `apps/umami/README.md`).

The Umami service will run Prisma migrations on startup and create its schema automatically.
