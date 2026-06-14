# `@khoralabs/users`

Domain and persistence layer for the **Khora registry** — network-level user data stored in encrypted SQLite (`registry.sqlite`).

Owns accounts, emails, auth provider links, Khora hosts, memberships (created via agent linking), agent bindings, and marketing consents. Does **not** implement sign-in; that lives in [`@khoralabs/users-auth`](../users-auth).

## Role in the stack

```mermaid
graph LR
  registry["apps/khoralabs/registry"] --> users["@khoralabs/users"]
  registry --> usersAuth["@khoralabs/users-auth"]
  usersReact["@khoralabs/users-react"] --> users
  usersAuth --> users
  users --> db[("registry.sqlite")]
```

| Package | Responsibility |
| --- | --- |
| `@khoralabs/users` | Domain schema, queries, migrations (`0.0.0 → 1.0.0`) |
| `@khoralabs/users-auth` | Better Auth integration, OTP, sessions |
| `@khoralabs/users-react` | Operator admin UI compound components |

## Schema

Domain tables (see `src/schema-sql.ts`):

| Table | Purpose |
| --- | --- |
| `accounts` | Canonical registry account |
| `account_emails` | Verified email addresses per account |
| `auth_links` | Maps external auth subjects (e.g. Better Auth user id) to accounts |
| `khora_hosts` | Federated Khora host catalog (`pending` → `active` via operator activate) |
| `memberships` | Account ↔ host participation (created on first agent link, removed when last agent unlinks) |
| `account_agent_links` | Many claimed agent DIDs per membership; one account per agent per host |
| `agent_account_bindings` | Global `agent_did → account_id` (one human account per agent network-wide) |
| `device_authorizations` | CLI device-flow sessions (RFC 8628-style) |
| `cli_link_challenges` | One-time agent signature challenges for `khora link` |
| `marketing_consents` | Opt-in / opt-out per list |

Auth provider tables (`user`, `session`, `verification`, …) are owned by `@khoralabs/users-auth` migrations.

## Database

```ts
import { getUsersDatabase, initUsersSchema } from "@khoralabs/users";

const db = getUsersDatabase();
await initUsersSchema(db);
```

| Env var | Purpose |
| --- | --- |
| `REGISTRY_DATABASE_PATH` | SQLite path (default: `packages/khoralabs/users/data/registry.sqlite`; use `:memory:` in tests) |
| `REGISTRY_SQLCIPHER_KEY` | SQLCipher encryption key (≥16 chars, required) |

## Public surface (quick map)

| Module | Exports |
| --- | --- |
| `accounts.ts` | `findAccountById`, `findAccountByEmail`, `findAccountByAuthSubject`, `linkBetterAuthUser`, `mergeEmailOntoAccount`, `listAccountEmails` |
| `khora-hosts.ts` | `registerKhoraHost`, `activateKhoraHost`, `listPublicHosts`, `findActiveHostBySlug`, `seedDefaultHost`, … |
| `host-slug.ts` | `normalizeHostSlug` validation |
| `host-url.ts` | `normalizeKhoraHostBaseUrl`, `findHostByBaseUrl` (loopback alias aware) |
| `memberships.ts` | `upsertMembership`, `listMembershipsForAccount`, … |
| `account-agent-links.ts` | `linkAgentToMembership`, `ensureAgentLinkedOnHost`, `propagateAgentLinksToHosts`, … |
| `agent-account-bindings.ts` | `bindAgentToAccount`, `findBindingByAgentDid`, `clearBindingIfNoHostLinks` |
| `device-authorizations.ts` | Device flow for `khora link` browser approval |
| `cli-link-challenges.ts` | Agent proof challenges for link API |
| `marketing-consents.ts` | `subscribeMarketing`, `unsubscribeMarketing`, `listMarketingConsentsForEmail`, … |
| `admin-stats.ts` | `getRegistryAdminSummary`, `lookupRegistryByEmail`, `lookupRegistryByAccountId` |
| `db.ts` | `getUsersDatabase`, `registryDatabasePath`, `resetUsersDatabase` |
| `schema.ts` | `usersMigrations`, `initUsersSchema`, `isUsersSchemaReady` |
| `types.ts` | `Account`, `KhoraHost`, `MarketingConsent`, admin lookup types |

## Registry vs host boundaries

The registry is the **control plane** (human identity, host catalog, agent participation records, agent bindings). Each Khora host is a **data plane** (DID-key agent auth, invite mint/consume, relay data). Even first-party hosts like `k-0` are external participants—not extensions of registry auth.

| Registry owns | Host owns |
| --- | --- |
| Better Auth sessions, accounts | Agent DID signatures |
| Host catalog & discovery | `POST /v1/register`, invite pepper |
| Membership + agent↔account bindings (participation audit) | Invite plaintext mint/consume |
| Marketing consents | Profiles, posts |
| Operator user lookup | Local admin console |

**Signup:** marketing homepage `/join` runs registry OTP (creates a verified user). Operator finds users in registry admin, mints invite tokens on host admin, delivers tokens manually. User registers on host, then links agent to registry account via CLI.

Registry never sees invite plaintext or hashes. Membership rows have no status or invite fields—only account, host, and timestamps.

## Host catalog lifecycle

1. **`POST /v1/hosts/register`** (registry) — inserts `khora_hosts` with `status: pending`.
2. **`POST /admin/api/hosts/:id/activate`** — operator console promotes to `active`.
3. **`GET /v1/hosts`** — public discovery (active hosts only).

CLI: `khora host list`, `khora host use <slug>`, `khora host register` (submits pending registration).

## Usage

```ts
import {
  findAccountByEmail,
  getUsersDatabase,
  subscribeMarketing,
} from "@khoralabs/users";

const db = getUsersDatabase();
const account = findAccountByEmail(db, "user@example.com");

subscribeMarketing(db, {
  email: "user@example.com",
  listSlug: "product-updates",
  sourceApp: "homepage",
});
```

## Tests

```bash
bun test
```
