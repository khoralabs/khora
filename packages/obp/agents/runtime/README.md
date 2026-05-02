# @cfd/obp-agent-runtime

Structured **one object per party turn** for OBP: **extend + bind + expose** in a single model output. Default agents do **not** register `obp_extend_offer` / `obp_expose_port` / `obp_bind_*` tools; the host applies graph mutations via `NegotiationRuntime.applyTurn`.

## Turn flow

1. `await runtime.prepareActingTurn(actingPartyId)` — (re)publishes synthetic noop / walk-away ports on the counterparty **head** offer when enabled, then returns a Zod schema and allowed port ids.
2. Build `ToolLoopAgent` output with `Output.object({ schema })` from the AI SDK (see `createStructuredObpNegotiationAgent`).
3. `runtime.applyTurn(actingPartyId, structuredOutput)` — validates, runs `extendOffer` with `bindPortId`, then `exposePort` for each entry in `ports` (may be empty).

## Options

| Option | Default | Meaning |
|--------|---------|--------|
| `requireNoop` | `true` | Expose noop synthetic port on the counterparty head offer and include it in the union. |
| `requireWalkAway` | `true` | Expose walk-away synthetic port and include it in the union. |
| `maxTurns` | (required) | After this many successful `applyTurn` calls, further turns throw. |

There is **no** turn TTL, rescind, or revoke in this package.

## System ports (noop / walk-away)

Synthetic port **ids** are deterministic per counterparty head offer:

- `obp-ar-noop:<headOfferId>`
- `obp-ar-walkaway:<headOfferId>`

Types: `obp.agent-runtime/noop` and `obp.agent-runtime/walk-away`. Binding walk-away invokes `requestNegotiationEnd` with reason `walk-away` when that callback is configured.

## DAG / replay invariants

- Each turn adds an **EXTENDS** edge from the acting party to a **new** offer, optionally a **BINDS** edge from that offer to the chosen counterparty port, and **EXPOSES** edges for each declared port on the new offer.
- Successive turns alternate parties; the chain stays connected because each bind targets a port that was **exposed** on a counterparty offer, and new exposes attach only to the acting party’s new offer.
- Audits from `applyTurn` record `chosenPortId`, `newOfferId`, and `exposedPortIds` for host-side visualization or replay checks.

## Graph seeding

`prepareActingTurn` requires at least one **counterparty** offer with an exposed port (or room to attach synthetic ports). The opening party cannot act until the counterparty surface exists—seed an initial offer/ports in the host before the first structured turn.
