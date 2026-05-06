# `@cfd/obp-client`

HTTP/2 **initiator** for the OBP reference frame binding (`POST /obp/v1`), built on **`runFrameSession`** from `@cfd/obp-core`. Pairs with `@cfd/obp-server` (`serveObp`).

## Usage

Use the same **`SessionInit`** (session id, party ids, actor pubkeys, genesis hash) as the server process. Base URL is normal **`http://host:port`** or **`https://…`** for `http2.connect` — not the Smithy `obp://host:port/<hex>` profile used by [`parseObpUrl`](../server/src/parse-url.ts).

```ts
import { connectObpSession, type ObpConnectOptions } from "@cfd/obp-client";
import {
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  generateEd25519KeyPair,
} from "@cfd/obp-core";

// persistence, ledgerSeq, init must match server; signer = initiator key (actor_pubkeys[1])
const { sessionOps, checkpoint } = await connectObpSession({
  url: "http://127.0.0.1:8765",
  signer: cliSigner,
  verifier: createEd25519FrameVerifier(),
  persistence,
  ledgerSeq,
  init,
  handlers: {
    async onProliferate(body) {
      return { portId: "main", payload: {} };
    },
  },
});
// checkpoint.seq === sessionOps.length; use with @cfd/obp-session-sync (Merkle root over ops)
```

`Obp.connect` is an alias of `connectObpSession` (symmetry with `Obp.serve` on the server package).

## Session sync

`checkpoint.seq` matches op count; pair with **`verifyExtends`** / envelopes per `@cfd/obp-session-sync` and **`cfd.obp.session`** in the Smithy spec.

## Verification

```bash
cd packages/obp/client && bun test && bunx tsc --noEmit
```

Optional demo (embedded server + client): `bun run example:client`.
