# @khoralabs/atrium-console-auth

Better Auth email-OTP sessions for the Atrium admin console ([Bun `bun:sqlite`](https://better-auth.com/docs/adapters/sqlite) + AWS SES).

## Setup

1. Copy env vars into the homepage `.env` (see `apps/atrium/homepage/.env.example`).
2. Generate a secret: `openssl rand -base64 32`
3. Create auth tables (use the same `ATRIUM_AUTH_DATABASE_PATH` as the homepage):

```bash
cd apps/atrium/homepage
bun --env-file=.env ../../../packages/atrium/console-auth/scripts/migrate.ts
```

`bun dev` on the homepage also runs migrations on first start (via preload).

Schema changes use [`@khoralabs/sqlite-migrate`](../../libs/sqlite-migrate/README.md); the initial migration delegates to Better Auth's `getMigrations()` so plugin tables stay in sync with the installed `better-auth` version.

## SES sandbox

If AWS returns `MessageRejected: Email address is not verified` for your **login email**, the account is still in [SES sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html): both `SES_FROM_ADDRESS` and every recipient must be verified identities in that region, or you need production access.

For local dev, set `ATRIUM_AUTH_OTP_LOG=true` in the homepage `.env` — the OTP is printed in the terminal instead of sent via SES.

## Admin allowlist

- **Bootstrap:** comma-separated `ADMIN_EMAIL_ALLOWLIST` — first sign-in creates a user with `role = admin`.
- **Promote later:** update SQLite directly:

```sql
UPDATE user SET role = 'admin' WHERE email = 'teammate@company.com';
```

## Usage

- Server: `import { auth, requireAdmin } from "@khoralabs/atrium-console-auth"`
- Browser: `import { authClient } from "@khoralabs/atrium-console-auth/client"`

Mount `auth.handler` on `/api/auth/*` in the homepage server.
