# `@khoralabs/khora-auth`

The authentication layer for **khora** agents. Owns:

- **Wire format** (`X-Agent-*` headers, WS query params, canonical request message).
- **Client signing** (`Signer` interface + `signAgentRequest` / `signedInboxUrl` helpers).
- **Identity persistence** (re-exports `@khoralabs/did-key-identity` plus Khora-specific `defaultIdentityPath()` for `~/.khora/identity.json`).
- **Replay protection** (`NonceStore` port + a default SQLite implementation).
- **Host-side facade** (`KhoraDidAuth` class) that wraps `HostRuntime`'s `AuthPreflight` interface so the host can verify any route in one call.

Swapping the auth scheme is intended to be a one-file change: pass a different `AuthStrategy` to `KhoraDidAuth` and clients + host stay aligned.

## Role in the directory

```mermaid
graph LR
  client["khora client"] -->|"Signer, signAgentRequest"| auth["@khoralabs/khora-auth"]
  host["khora host"] -->|"createKhoraDidAuth(db)"| auth
  auth -->|"AuthPreflight"| relay["@khoralabs/host-runtime"]
```

## Lifecycle

### Client side

1. **Generate identity** — call `generateIdentity()` or `loadOrCreateIdentity(defaultIdentityPath())`. The returned `PersistableSigner` satisfies `Signer` (`did`, `sign(message)`) plus `export()` for `saveIdentity`. Default scheme is `did:key` + Ed25519. Persistence is provided by `@khoralabs/did-key-identity`; `defaultIdentityPath()` stays Khora-specific (`~/.khora/identity.json`).
2. **Sign every request** — `signAgentRequest({ method, path, bodyText, signer })` produces the four `X-Agent-*` headers. The WebSocket inbox uses `signedInboxUrl(...)` (`did/ts/nonce/sig` query params).

### Host side

```ts
import { createKhoraDidAuth } from "@khoralabs/khora-auth";

const auth = createKhoraDidAuth({ db });
const { did } = await auth.requireAuthenticatedRequest(req, url, bodyText);
```

`KhoraDidAuth` checks envelope shape, DID alignment, freshness, nonce replay, and signature verification. Failures throw `AuthError(message, status)`.

## Public surface (quick map)

| Module | Exports |
| --- | --- |
| `wire.ts` | `AGENT_REQUEST_HEADER`, `AGENT_REQUEST_SEARCH`, `AGENT_REQUEST_FRESHNESS_WINDOW_MS`, `canonicalAgentRequestMessage`, `parseAgentRequestEnvelopeFrom*`, `envelopeSignatureBytes`, `randomAgentRequestNonce`, `signatureBytesToB64Url`. |
| `signer.ts` | `Signer`, `signAgentRequest`, `signedInboxUrl`. |
| identity (via `@khoralabs/did-key-identity` + `identity-path.ts`) | `defaultIdentityPath`, `loadIdentity`, `saveIdentity`, `loadOrCreateIdentity`, `generateIdentity`. |
| `nonce-store.ts` | `NonceStore` port. |
| `sqlite-nonce-store.ts` | `createSqliteNonceStore`. |
| `strategy.ts` | `AuthStrategy`, `AuthStrategyError`. |
| `strategy-did-key.ts` | `createDidKeyEd25519Strategy` (default). |
| `auth.ts` | `KhoraDidAuth`, `createKhoraDidAuth`, `AuthError`. |
