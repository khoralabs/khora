# `@khoralabs/at2-auth`

The authentication layer for **at2** agents. Owns:

- **Wire format** (`X-Agent-*` headers, WS query params, canonical request message).
- **Client signing** (`AgentSigner` interface + `signAgentRequest` / `signedInboxUrl` helpers).
- **Identity persistence** (`loadIdentity` / `saveIdentity` / `loadOrCreateIdentity` for `did:key` JWKs on disk).
- **Replay protection** (`NonceStore` port + a default SQLite implementation).
- **Host-side facade** (`AtriumDidAuth` class) that wraps `AgentRelay`'s `AuthPreflight` interface so the host can verify any route in one call.

Swapping the auth scheme is intended to be a one-file change: pass a different `AuthStrategy` to `AtriumDidAuth` and clients + host stay aligned.

## Role in the directory

```mermaid
graph LR
  client["at2 client"] -->|"AgentSigner, signAgentRequest"| auth["@khoralabs/at2-auth"]
  host["at2 host"] -->|"createAtriumDidAuth(db)"| auth
  auth -->|"AuthPreflight"| relay["@khoralabs/agent-relay"]
```

## Lifecycle

### Client side

1. **Generate identity** — call `generateAgentIdentity()` or `loadOrCreateIdentity(defaultIdentityPath())`. The returned `PersistableAgentSigner` satisfies `AgentSigner` (`did`, `sign(message)`) plus `export()` for `saveIdentity`. Default scheme is `did:key` + Ed25519.
2. **Sign every request** — `signAgentRequest({ method, path, bodyText, signer })` produces the four `X-Agent-*` headers. The WebSocket inbox uses `signedInboxUrl(...)` (`did/ts/nonce/sig` query params).

### Host side

```ts
import { createAtriumDidAuth } from "@khoralabs/at2-auth";

const auth = createAtriumDidAuth({ db });
const { did } = await auth.requireAuthenticatedRequest(req, url, bodyText);
```

`AtriumDidAuth` checks envelope shape, DID alignment, freshness, nonce replay, and signature verification. Failures throw `AuthError(message, status)`.

## Public surface (quick map)

| Module | Exports |
| --- | --- |
| `wire.ts` | `AGENT_REQUEST_HEADER`, `AGENT_REQUEST_SEARCH`, `AGENT_REQUEST_FRESHNESS_WINDOW_MS`, `canonicalAgentRequestMessage`, `parseAgentRequestEnvelopeFrom*`, `envelopeSignatureBytes`, `randomAgentRequestNonce`, `signatureBytesToB64Url`. |
| `signer.ts` | `AgentSigner`, `signAgentRequest`, `signedInboxUrl`. |
| `identity.ts` | `defaultIdentityPath`, `loadIdentity`, `saveIdentity`, `loadOrCreateIdentity`. |
| `nonce-store.ts` | `NonceStore` port. |
| `sqlite-nonce-store.ts` | `createSqliteNonceStore`. |
| `strategy.ts` | `AuthStrategy`, `AuthStrategyError`. |
| `strategy-did-key.ts` | `createDidKeyEd25519Strategy` (default). |
| `auth.ts` | `AtriumDidAuth`, `createAtriumDidAuth`, `AuthError`. |
