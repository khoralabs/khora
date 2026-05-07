# `@cfd/obp-server`

HTTP/2 **reference binding** for [`cfd.obp.frame`](../spec/model/frame-protocol.smithy) (transport-agnostic frames + length-prefixed canonical JSON).

- **`obp://`** → cleartext **HTTP/2** (`h2c`) — [`frame-binding-http2.smithy`](../spec/model/frame-binding-http2.smithy)
- **`obps://`** → **TLS + HTTP/2** — pass `listen.tls` to `serveObp`

## Prereqs

The **server runs as the frame session responder** ([`runFrameSession`](../../core/src/frames/session-pipeline.ts) with `role: "responder"`). You must supply a [`SessionInit`](../../core/src/frames/types.ts) identical to what the initiator sends (`session_id`, `party_ids`, `actor_pubkeys`, `genesis_hash`). **Graph mutations from received frames** are applied through the shared [`@cfd/obp-core`](../core) client. **Outbound** `TURN` effects are applied on the **receiver** only by default; use **`graphApplyOutbound: true`** when the server has its own store (see `runFrameSession`).

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
  async onIncomingOffer(body, session) {
    if (body.bindPortId === "start_order") {
      await session.terminate("done");
      return null;
    }
    return {
      offerId: "greeting",
      offerType: "obp.frame",
      ports: [{ id: "start_order", isTerminal: false }],
    };
  },
});
```

```bash
bun run --filter @cfd/obp-server typecheck
bun run --filter @cfd/obp-server test
```
