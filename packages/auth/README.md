# `@khoralabs/khora-auth`

Standards-oriented crypto/auth primitives for the Khora umbrella. Grouped by **mechanism**, not by product service.

## Layout

```
src/
  encoding/           # codecs (base64url, base58)
  did/                # DID / did:key strategy + pubkey
  http/
    signed-request/   # application-layer signed HTTP (X-Agent-*)
    bearer.ts         # Authorization: Bearer
    session-cookie.ts # HMAC session cookies
    root-token-auth.ts # composer: root-token console auth
  replay/             # NonceStore port + in-memory fixture
  rate-limit/         # sliding-window limiter
  testing.ts          # NonceStore contract tests (./testing)
```

Future slots (not implemented): `http/message-signatures/` (RFC 9421), `jose/jws.ts`.

## Public surface

| Area | Imports |
| --- | --- |
| DID / strategy | `createDidKeyEd25519Strategy`, `AuthStrategy`, `publicKeyForDid` |
| Signed HTTP | `signAgentRequest`, `createSignedRequestAuth`, `SignedRequestAuth` |
| Console / root token | `createRootTokenAdminAuth`, `createAdminTokenAuthFromEnv`, `AdminTokenAuth` |
| Replay | `NonceStore`, `createMemoryNonceStore` — **storage backends live in the host** (`createSqliteNonceStore` on `@khoralabs/khora-host/sqlite`) |
| Testing | `@khoralabs/khora-auth/testing` → `runNonceStoreContractTests` |

Identity file helpers re-export `@khoralabs/did-key-identity`. Product default path `~/.khora/identity.json` lives in apps (cli/daemon), not here.

Post **content** signing lives in `@khoralabs/khora-auth` (`posts/signing`). Host `AuthPreflight` typing lives in `@khoralabs/khora-host`.

## Host wiring

```ts
import { createSignedRequestAuth } from "@khoralabs/khora-auth";
import { createSqliteNonceStore } from "@khoralabs/khora-host/sqlite";

const auth = createSignedRequestAuth({
  nonceStore: createSqliteNonceStore(db),
});
```
