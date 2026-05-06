# @cfd/obp-agent-runtime

Layered runtime for OBP-driven negotiations. The supported entry point is the **bilateral structured contract** wired through a coordinator and a shared ledger; the lower-level `NegotiationRuntime` class remains as a deprecated escape hatch.

## Architecture

```
ObpLedger (shared truth: client + persistence + turn counter + audit tail)
  └── BilateralCoordinator (who acts when; one atomic apply per turn)
        └── TurnContract<TAudit> (per-agent view + intent)
              ├── createNegotiationStructuredBilateralContract  (reference path)
              └── createNegotiationToolLoopBilateralContract    (experimental stub)
```

- `ObpLedger` owns the negotiation's `OBPPersistenceClient`, `ObpPersistence`, wall clock, `maxTurns`, and audit tail.
- `TurnContract.prepare(partyId)` returns a `PreparedTurn` (Zod schema **or** allowed-tool whitelist + system fragments + user message + metadata).
- `TurnContract.apply(partyId, raw)` mutates the graph and records an audit on the ledger.
- `BilateralCoordinator.runNextTurn()` alternates parties, calls a host-supplied `RunAgentTurn` to produce raw output, then hands it to the contract's `apply`.

## Turn flow (structured-bilateral, recommended)

1. Construct an `ObpLedger<NegotiationTurnAudit>` once per conversation.
2. Create a contract with `createNegotiationStructuredBilateralContract({ ledger, partyRoleName, getGraphSnapshot, defaultPortTtl, … })`.
3. Wrap it in a `BilateralCoordinator({ ledger, partyA, partyB, contract, runAgentTurn })`.
4. The coordinator drives turns: it asks the contract to `prepare(partyId)`, hands the `PreparedTurn` to your `runAgentTurn` (which calls the LLM), and forwards the raw output to `contract.apply(partyId, raw)`. The contract validates, mutates the graph, and writes an audit on the ledger.

## Tool-loop bilateral (experimental)

`createNegotiationToolLoopBilateralContract` returns a `PreparedTurn` with `kind: "tool-loop"` whose `allowedToolNames` is `obp_extend_offer` / `obp_expose_port` / `obp_end_negotiation` plus one `obp_bind__<portId>` per live counterparty bind target. `apply` returns the audit recorded since `prepare` (when a sibling structured contract advanced the ledger) or synthesises a noop bind audit so the coordinator always advances. Wire it to a real `ToolLoopAgent` in your host; this contract is intentionally a stub until a richer audit (graph-delta) lands.

## Low-level escape hatch (deprecated)

`NegotiationRuntime` / `NegotiationRuntimeOptions` are still exported for callers that need the raw `prepareActingTurn` / `applyTurn` (`prepareGenesisTurn` / `applyGenesisTurn`) interface. They bypass `ObpLedger` and will be hidden in a follow-up release. New code should use the contract + coordinator path above.

## Options (shared by both contracts and the legacy runtime)

| Option | Default | Meaning |
|--------|---------|--------|
| `requireNoop` | `true` | Expose noop synthetic port on the counterparty head offer and include it in the union. |
| `requireWalkAway` | `true` | Expose walk-away synthetic port and include it in the union. |
| `maxTurns` | (required, on the ledger) | After this many successful `apply` calls, the coordinator stops scheduling. |

There is **no** turn TTL, rescind, or revoke in this package.

## System ports (noop / walk-away)

Synthetic port **ids** are deterministic per counterparty head offer:

- `obp-ar-noop:<headOfferId>`
- `obp-ar-walkaway:<headOfferId>`

Types: `obp.agent-runtime/noop` and `obp.agent-runtime/walk-away`. Binding walk-away invokes `requestNegotiationEnd` with reason `walk-away` when that callback is configured.

## DAG / replay invariants

- Each turn adds an **EXTENDS** edge from the acting party to a **new** offer, optionally a **BINDS** edge from that offer to the chosen counterparty port, and **EXPOSES** edges for each declared port on the new offer.
- Successive turns alternate parties; the chain stays connected because each bind targets a port that was **exposed** on a counterparty offer, and new exposes attach only to the acting party's new offer.
- Audits from `apply` record `chosenPortId`, `newOfferId`, and `exposedPortIds` for host-side visualization or replay checks.

## Graph seeding

The structured contract handles the opening turn automatically: when `partyId` has no bindable counterparty ports it issues a **genesis** schema (set `offerType` + expose ports) instead of a bind schema. The legacy `NegotiationRuntime.prepareActingTurn` still requires a counterparty offer with at least one exposed port — seed an initial offer/ports in the host before the first call when using the escape hatch.
