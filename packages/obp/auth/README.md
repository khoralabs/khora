# `@khoralabs/obp-auth`

Optional **transport admission** helpers for OBP HTTP/2 bindings: prove an inbound connection is allowed to use a given **`SessionInit`** before frames flow. Does **not** replace frame-level Ed25519 (**`FrameDag`**) in **`@khoralabs/obp-core`**.

## Pairing ticket (shared secret)

**`signPairingTicket(init, pairingSecretHex)`** → `payload_b64url.hmac_b64url`

- MAC over **`canonicalJsonUtf8(sessionInitToWire(init))`**
- Server holds **`pairingSecretHex`**; client receives the ticket out-of-band (e.g. bootstrap JSON).
- **`verifyPairingTicket(ticket, pairingSecretHex)`** → **`SessionInit | null`**

Use when both sides can agree on a random secret once (pairing UI, operator-generated bootstrap).

## Session invite (server signing key)

**`signInvite(init, frameSigner, opts?)`** → `payload_b64url.ed25519_sig_b64url`

- Payload: **`{ session, nonce, issuedAt, expiresAt? }`** (canonical JSON bytes signed by the server **`FrameSigner`**).
- **`verifyInvite(token, serverActorHex, opts?)`** verifies Ed25519 and checks **`expiresAt`**; requires **`serverActorHex`** to appear in **`init.parties`**.

Use when clients pin the responder’s OBP pubkey (discovery, config, TLS pubkey-pin-style) and should not need a separate pairing secret.

## Bootstrap helpers

**`ObpServerBootstrap`** / **`ObpClientBootstrap`** split responder vs initiator JSON artifacts; **`exportJwkPair`**, **`importEd25519Pair`**, **`responderSignerFromBootstrap`**, **`initiatorSignerFromBootstrap`** wrap WebCrypto JWK roundtrips for **`createEd25519FrameSigner`**.

Apps still own **`onConnect`** policy (e.g. extracting **`Authorization: Bearer …`**) and persistence hydration.

```bash
bun run --filter @khoralabs/obp-auth typecheck
bun run --filter @khoralabs/obp-auth test
```
