# `@cfd/obp-server`

HTTP/2 **reference binding** for [`cfd.obp.frame`](../spec/model/frame-protocol.smithy) (transport-agnostic frames + length-prefixed canonical JSON).

- **`obp://`** → cleartext **HTTP/2** (`h2c`) — [`frame-binding-http2.smithy`](../spec/model/frame-binding-http2.smithy)
- **`obps://`** → **TLS + HTTP/2** — pass `listen.tls` to `serveObp`

## Prereqs

The **server runs as the frame session responder** ([`runFrameSession`](../../core/src/frames/session-pipeline.ts) with `role: "responder"`). You must supply a [`SessionInit`](../../core/src/frames/types.ts) identical to what the initiator sends (`session_id`, `party_ids`, `actor_pubkeys`, `genesis_hash`). **Graph mutations from received frames** are applied through the shared [`@cfd/obp-core`](../core) client; for **outbound** `PROLIFERATE` / `RESOLVE`, effects are applied on the **receiver** only (so a **shared** `ObpPersistence` across peers matches the in-repo tests). For **separate** databases per peer, treat replication as an application concern or extend the pipeline.

## Example

```typescript
import {
  createEd25519FrameSigner,
  generateEd25519KeyPair,
  sha256HexUtf8,
  type SessionInit,
} from "@cfd/obp-core";
import { Obp } from "@cfd/obp-server";

const keys = await generateEd25519KeyPair();
const signer = await createEd25519FrameSigner(keys.privateKey, keys.publicKey);

await Obp.serve({
  signer,
  persistence,
  ledgerSeq: () => ++seq,
  init: { session_id, party_ids, actor_pubkeys, genesis_hash: await sha256HexUtf8("seed") },
  listen: { port: 8787 },
  async onConnect(session) {
    await session.expose({
      offerId: "greeting",
      ports: [{ id: "start_order", isTerminal: false }],
    });
  },
  async onBind(portId, payload, session) {
    // ...
  },
});
```

```bash
bun run --filter @cfd/obp-server typecheck
bun run --filter @cfd/obp-server test
```
