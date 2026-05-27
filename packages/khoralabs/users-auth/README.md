# `@khoralabs/users-auth`

Authentication layer for the **Khora registry**. Wraps [Better Auth](https://www.better-auth.com/) (email OTP sign-in) and syncs authenticated users into the domain model in [`@khoralabs/users`](../users).

## Role in the stack

```mermaid
graph LR
  homepage["apps/atrium/homepage"] -->|"client export"| usersAuth["@khoralabs/users-auth"]
  registry["apps/khoralabs/registry"] --> usersAuth
  usersAuth --> users["@khoralabs/users"]
  usersAuth --> betterAuth["better-auth"]
  usersAuth --> ses["AWS SES"]
  users --> db[("registry.sqlite")]
```

Domain data (`accounts`, `memberships`, …) stays in `@khoralabs/users`. This package adds Better Auth tables, session handling, OTP delivery, and hooks that call `linkBetterAuthUser` when a user signs in.

## Exports

| Entry | Use |
| --- | --- |
| `@khoralabs/users-auth` | Server: auth instance, schema bootstrap, session helpers |
| `@khoralabs/users-auth/client` | Browser: `createUsersAuthClient` (React / Better Auth client) |

## Server setup

The registry app mounts Better Auth at `/api/auth` and runs combined migrations on startup:

```ts
import { ensureRegistrySchema, getRegistryAuth } from "@khoralabs/users-auth";

await ensureRegistrySchema();
const auth = getRegistryAuth();

// in fetch handler:
if (path.startsWith("/api/auth")) {
  return auth.handler(req);
}
```

`ensureRegistrySchema` applies `@khoralabs/users` migrations first, then Better Auth migrations (`1.0.0 → 2.0.0`).

## Browser client

```ts
import { createUsersAuthClient } from "@khoralabs/users-auth/client";

export const authClient = createUsersAuthClient({
  registryUrl: "http://localhost:4000",
});

// Email OTP sign-in (Better Auth emailOTP plugin)
await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
await authClient.signIn.emailOtp({ email, otp });
```

Used by [`apps/atrium/homepage`](../../../apps/atrium/homepage) for `/login`.

## Session helpers

```ts
import { getRegistrySession, verifyRegistrySession } from "@khoralabs/users-auth";

// Same process as the registry server
const session = await getRegistrySession(req);

// Remote verification (forwards session cookie to registry)
const session = await verifyRegistrySession(req, {
  registryUrl: "http://localhost:4000",
});
```

## Environment

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Session signing secret (≥32 chars in production) |
| `REGISTRY_URL` / `BETTER_AUTH_URL` | Public base URL for auth callbacks |
| `REGISTRY_TRUSTED_ORIGINS` | Comma-separated CORS / trusted origins |
| `REGISTRY_COOKIE_DOMAIN` | Optional cross-subdomain cookie domain |
| `SES_FROM_ADDRESS` | OTP sender address |
| `AWS_REGION` | SES region |
| `REGISTRY_AUTH_OTP_LOG=1` | Log OTP to console instead of sending email (dev) |
| `REGISTRY_SQLCIPHER_KEY` | Inherited from `@khoralabs/users` (shared DB) |

Bootstrap staff emails (granted `role: "staff"`) are configured in `src/bootstrap.ts`.

## Public surface (quick map)

| Module | Exports |
| --- | --- |
| `auth-config.ts` | `createRegistryAuth`, `RegistryAuth`, `RegistryAuthOptions` |
| `auth.ts` | `getRegistryAuth`, `registryAuth` (lazy proxy) |
| `client.ts` | `createUsersAuthClient` |
| `db.ts` | `getRegistryDatabase` (alias of `getUsersDatabase`) |
| `ensure-schema.ts` | `ensureRegistrySchema`, `isRegistryAuthSchemaReady` |
| `schema.ts` | `authMigrations`, `registryMigrations`, `initRegistrySchema` |
| `session.ts` | `getRegistrySession`, `RegistrySession` |
| `verify-registry-session.ts` | `verifyRegistrySession` |
| `bootstrap.ts` | `isBootstrapStaffEmail`, `bootstrapStaffEmails` |
