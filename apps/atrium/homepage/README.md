# Atrium homepage

Bun full-stack app: landing page, admin console, and BFF routes to the Atrium server.

## Setup

```bash
bun install
cp .env.example .env
# Set BETTER_AUTH_SECRET (required, >= 32 chars): openssl rand -base64 32
# Set ADMIN_EMAIL_ALLOWLIST and SES credentials
```

Put `.env` in **`apps/atrium/homepage/.env`** (or monorepo root `.env`). `bun dev` preloads both; app-local values override root.

Run Better Auth migrations (once):

```bash
cd ../../packages/atrium/console-auth
bun run migrate
```

Use the same `ATRIUM_AUTH_DATABASE_PATH` in both packages (homepage `.env` is loaded when you `bun dev` from here; migrate reads env from the shell or a local `.env` in `console-auth`).

## Development

```bash
bun dev
```

- `/` — landing
- `/login` — admin email OTP sign-in
- `/admin` — stats dashboard (requires session)
- `/api/auth/*` — Better Auth API
- `/api/admin/*` — BFF to Atrium internal stats (requires admin session)

## Promote an admin (without env allowlist)

```sql
UPDATE user SET role = 'admin' WHERE email = 'teammate@company.com';
```

Run against the SQLite file at `ATRIUM_AUTH_DATABASE_PATH`.
