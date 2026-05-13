# `@khoralabs/obp-client`

HTTP/2 client for the OBP reference frame binding (`POST /obp/v1`), built on **`runFrameMultiplexSession`** (deferred opener) from `@khoralabs/obp-core`. Pairs with `@khoralabs/obp-server` (`serveObp`).

## WebSocket and other `FrameChannel` transports

The OBP **wire** is length-prefixed canonical JSON on a duplex byte stream (same as the HTTP/2 reference binding; see `packages/obp/persistence/spec/model/frame-binding-http2.smithy`). Any transport that exposes **`FrameChannel`** can carry the same session:

- **`connectObpFrameChannelSession`** — run the deferred multiplex client over an existing channel (e.g. in-memory pair in tests, or a relay you bridge yourself).
- **`connectObpWebSocketSession`** — wraps `WebSocket` with **`createWebSocketFrameChannel`** from `@khoralabs/frame-channel`: each **binary message** is one **ordered chunk** of the byte stream (the frame decoder may buffer across chunks).

For Atrium / Swarm room relays, peers connect with a room-scoped ticket; both sides attach to the same relayed room and run **`runFrameMultiplexSession`** (responder) / **`connectObpWebSocketSession`** (initiator) on their respective sockets.

## Lifecycle

1. **Connection** — One long-lived HTTP/2 POST stream until the multiplex runner finishes and the channel goes idle.
2. **Chain** — Each **`await conn.init(init, hooks)`** sends **`{ init }`**, registers that **`session_id`**, and returns a **`FrameSessionHandle`** for **`sendTurn` / `terminate`**.
3. **Offers** — Inbound **`TURN`** bodies on that chain invoke **`hooks.onIncomingOffer`** only (no connection-wide offer handler).

Later **`conn.init`** calls must match the **same parties tuple** as the first chain (multiplex template).

Env **`sessionEnvelopeSync: true`** defers **`from_party`** until after the first **`conn.init`** (lazy party id).

### Reactive vs proactive negotiation

The wire protocol does **not** guarantee polite turn-taking: inbound **`TURN`**s can arrive whenever the peer sends them. After connection:

- **Reactive** — implement **`hooks.onIncomingOffer`** and return an outbound **`TurnBody | null`** as each inbound snapshot arrives.
- **Proactive** — call **`chain.sendTurn`** from your own async tasks.

Core **`runFrameMultiplexSession`** serializes **outbound** graph steps **per chain** (mint causal frame → write → envelope bookkeeping) so overlapping **`sendTurn`** calls and handler replies do not mint sibling frames off the same DAG tip. Still **`await chain.sendTurn(...)`** when your app-level protocol requires strict ordering of *logical* steps.

Avoid deadlocks: do not **`await waitForTurn`** inside **`onIncomingOffer`** on the same chain unless that wait can resolve from another task or you use the coordinator pattern below.

### Negotiation policies (application layer)

There is **no generic wire signal** for “no more ports will be exposed” unless your **application protocol** or **port terminal semantics** define it. Decide explicitly:

| Concern | Typical lever |
|--------|----------------|
| Orphan / unknown offers | Persistence graph (`OBPPersistenceClient`), ignore vs **`null`** reply vs **`terminate`** |
| Many offers / binds on one port | **`PortSpec.max_bindings`**, **`validateBindPreconditions`**, policy when exceeded |
| Many offers across ports | Correlate with **`offerId`**, **`turn_seq`**, port ids |
| How long to wait for a bind | Timer + **`chain.terminate`** or teardown **`conn`** |
| How long to wait for counterparty exposes | Timer + **`waitForTurn`** / **`waitForPortOnOffer`** (below) or app timeout |

See **`@khoralabs/obp-core`** invariants and **`TurnBody`** / **`bind_policy`** on ports.

### Awaiting inbound offers (`createNegotiationCoordinator`)

Use **`createNegotiationCoordinator`** and **`waitForPortOnOffer`** from **`@khoralabs/obp-core`** to **`await`** the next inbound **`TurnBody`** matching a predicate (with optional **`timeoutMs`** / **`AbortSignal`**) while still wiring **`onIncomingOffer`** for replies. **`waitForTurn`** only matches turns observed **after** the waiter is registered; call **`dispose()`** if abandoning the chain early.

```ts
import { createNegotiationCoordinator, waitForPortOnOffer } from "@khoralabs/obp-core";

const coord = createNegotiationCoordinator({
  async onIncomingOffer(body, chain) {
    /* return reply or null as usual */
    return null;
  },
});

await conn.init(init, coord.hooks);
void (async () => {
  const expose = await waitForPortOnOffer(coord, "their-offer", "port-a", { timeoutMs: 30_000 });
  /* …then e.g. chain.sendTurn bind … */
})();
```

## Usage

Use the same **`SessionInit`** shape as the server (**`parties`**, genesis, session id). Base URL is **`http://host:port`** or **`https://…`** for `http2.connect`.

```ts
import { connectObpSession, type ObpConnectOptions } from "@khoralabs/obp-client";
import {
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  generateEd25519KeyPair,
} from "@khoralabs/obp-core";

const { sessionOps, checkpoint } = await connectObpSession(
  {
    url: "http://127.0.0.1:8765",
    signer: cliSigner,
    verifier: createEd25519FrameVerifier(),
    persistence,
    ledgerSeq,
  },
  async (conn) => {
    const chain = await conn.init(init, {
      async onIncomingOffer(body) {
        if (body.offerId === "greeting") {
          return {
            offerId: "",
            offerType: "obp.frame.bind",
            bindPortId: "main",
            counterparty_bind: {},
          };
        }
        return null;
      },
    });
    await chain.sendTurn({ offerId: "open", offerType: "obp.frame", ports: [] });
  },
);
// checkpoint.seq === sessionOps.length; use with @khoralabs/obp-session-sync
```

`Obp.connect` is an alias of `connectObpSession`.

### Multiple chains on one stream

Call **`conn.init`** again after earlier chains end (or overlap if both sides support concurrent **`session_id`** graphs). Use **`conn.close()`** when no further chains will be opened so the byte stream can shut down once every chain has **`TERMINATE`**’d.

### Future ergonomics

Rich **`Offer` / `Port`** OO wrappers or async iterators over ports remain optional layers above **`TurnBody`** + **`sendTurn`**; **`createNegotiationCoordinator`** is the thin **`waitForTurn`** helper in **`@khoralabs/obp-core`** today.

## Session sync

`checkpoint.seq` matches op count; pair with **`verifyExtends`** / envelopes per `@khoralabs/obp-session-sync`.

## Verification

```bash
cd packages/obp/client && bun test && bunx tsc --noEmit
```

Optional demo (embedded server + client): `bun run example:client`.
