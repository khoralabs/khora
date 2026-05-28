# Khora homepage

Bun full-stack app: landing page and registry-backed sign-in.

## Setup

```bash
bun install
cp .env.example .env
```

Put `.env` in **`apps/khora/homepage/.env`** (or monorepo root `.env`). `bun dev` preloads both; app-local values override root.

## Development

```bash
bun dev
```

- `/` — landing
- `/login` — email OTP sign-in via the Khora registry (`@khoralabs/users-auth`)

## Operator admin

Operator dashboards live on the backend services, not this app:

- **Khora host** — `http://localhost:8788/admin` (root token: `ATRIUM_CONSOLE_ROOT_TOKEN`)
- **Registry** — `http://localhost:4000/admin` (root token: `REGISTRY_CONSOLE_ROOT_TOKEN`)

## Environment

See [`.env.example`](.env.example). Required:

- `KHORA_REGISTRY_URL` / `BUN_PUBLIC_KHORA_REGISTRY_URL` — registry base URL for browser auth client
