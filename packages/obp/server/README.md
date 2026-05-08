# `@cfd/obp-server`

HTTP/2 **reference binding** for [`cfd.obp.frame`](../spec/model/frame-protocol.smithy) (transport-agnostic frames + length-prefixed canonical JSON).

- **`obp://`** → cleartext **HTTP/2** (`h2c`) — [`frame-binding-http2.smithy`](../spec/model/frame-binding-http2.smithy)
- **`obps://`** → **TLS + HTTP/2** — pass `listen.tls` to `serveObp`

## Prereqs

The server **`serveObp`** runs **`runFrameMultiplexSession`** as responder (**`initiatorChainPlans: []`**): each **`POST /obp/v1`** stream waits for the peer’s inbound **`init`** and stays alive across TERMINATE so the client can open additional chains. The client drives closure via **`conn.close()`** and idle shutdown. For each stream, **`onConnect`** runs with request **headers** before any frames are read: authenticate (e.g. `Authorization`), build a [`SessionInit`](../../core/src/frames/types.ts) and local [`FrameSigner`](../../core/src/frames/signer.ts) aligned with that caller, and return `{ init, signer }`; on throw, the stream responds **401**. The wire **`init`** the peer sends must match **`init`**. **Graph mutations** from frames go through [`@cfd/obp-core`](../core); each peer applies **`TURN`** effects to its own persistence.

**Negotiation semantics:** peers may send offers out of order; **`onIncomingOffer`** is reactive and **`session.sendTurn`** is proactive. Core serializes outbound DAG advances **per chain** so concurrent **`sendTurn`** and handler replies do not fork the causal tip. Application policies (orphans, floods, bind/expose timeouts, when negotiation is “done”) belong above core—see **`createNegotiationCoordinator`** / **`waitForPortOnOffer`** in [`@cfd/obp-core`](../core) and the client README’s checklist. There is no wire-level “expose complete” unless your app protocol defines it.

## Example

```typescript
import { createEd25519FrameSigner, generateEd25519KeyPair } from "@cfd/obp-core";
import { Obp } from "@cfd/obp-server";

const keys = await generateEd25519KeyPair();
const signer = await createEd25519FrameSigner(keys.privateKey, keys.publicKey);

const init = {
  session_id: "example",
  parties: [
    { id: "00000000-0000-0000-0000-000000000001", pubkey: signer.actor },
    {
      id: "00000000-0000-0000-0000-000000000002",
      pubkey: "0000000000000000000000000000000000000000000000000000000000000000",
    },
  ],
  genesis_hash: "0000000000000000000000000000000000000000000000000000000000000000",
};

await Obp.serve({
  persistence,
  ledgerSeq: () => ++seq,
  listen: { port: 8787 },
  onConnect: async ({ headers }) => {
    void headers; // authenticate, then return the matching SessionInit for this stream
    return { signer, init };
  },
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
