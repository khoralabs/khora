# Umami analytics for Khora services

Self-hosted [Umami](https://umami.is) instance used by Exedra. Umami receives events forwarded server-side from Exedra's `/api/events` proxy and stores them in PostgreSQL.

Default login after first start: **username** `admin` / **password** `umami`. Change the password immediately.

## Prerequisites

Umami requires a PostgreSQL database. For local dev, run `apps/postgres` first (see `apps/postgres/README.md`). For production, use Render Managed PostgreSQL.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `APP_SECRET` | ✅ | Random secret for auth tokens (`openssl rand -hex 32`) |
| `DISABLE_BOT_CHECK` | ✅ | Set to `1` — allows server-side events from Exedra |
| `PORT` | — | HTTP port (default `3000`) |

Copy `.env.example` to `.env` and fill in the values:

```sh
cp apps/umami/.env.example apps/umami/.env
```

## Build

Use the **repository root** as the build context:

```sh
docker build -t khora-umami -f apps/umami/Dockerfile .
```

## Run (local dev)

Start Postgres first, then Umami:

```sh
docker run -d --name khora-postgres \
  -p 5432:5432 \
  -v khora-postgres-data:/var/lib/postgresql/data \
  khora-postgres

docker run -d --name khora-umami \
  --env-file apps/umami/.env \
  -p 3001:3000 \
  khora-umami
```

Umami is available at <http://localhost:3001>. Umami runs its Prisma migrations on startup and creates the schema automatically.

## Setup: create website and get Website ID

1. Log in at <http://localhost:3001> (admin / umami).
2. **Settings → Websites → Add website** — name it `exedra`, URL `http://localhost:3000`.
3. Click the website's **Edit** button → copy the **Website ID**.
4. Set `UMAMI_URL` and `UMAMI_WEBSITE_ID` in `apps/exedra/.env` (see `apps/exedra/.env.example`).

## Render (production)

Deploy Umami as a **Web Service** from the repository root:

| Setting | Value |
| --- | --- |
| Root Directory | *(empty)* |
| Dockerfile Path | `apps/umami/Dockerfile` |
| Port | `3000` |

Set the following environment variables on the Umami service in Render:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Internal URL from Render Managed PostgreSQL |
| `APP_SECRET` | `openssl rand -hex 32` |
| `DISABLE_BOT_CHECK` | `1` |

Then set on the **Exedra** service:

| Variable | Value |
| --- | --- |
| `UMAMI_URL` | Internal hostname of the Umami service (e.g. `http://khora-umami:3000`) |
| `UMAMI_WEBSITE_ID` | Website ID from Umami Settings → Websites |

Umami does not need to be publicly accessible — deploy it as a **Private Service** if you only need server-side event forwarding from Exedra. Upgrade to a Web Service (public URL) only if you want to embed the Umami tracker script client-side.
