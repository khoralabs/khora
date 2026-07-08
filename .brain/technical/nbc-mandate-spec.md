# NBC Mandate Compiler — Implementation Spec

## 1. Overview

This package (`@statespace/nbc`) implements a **mandate compiler for bilateral NBC (Negotiated Binding Convention) agents**. It bridges `@statespace/core` and `@khoralabs/obp-v2-nbc` to give developers a policy language for constraining LLM-driven negotiators.

### Design goals

- Each party's mandate is **private**. No cross-party policy disclosure is required or assumed.
- Mandates are specified as **declarative state machines** using the existing `StateSpace<T>` primitives, extended with NBC-specific concepts.
- The compiled mandate produces a **`MandateGuard`** — a runtime filter that, given the current negotiation state, returns the set of moves the LLM is allowed to make.
- The LLM never sees the mandate, CEL expressions, schemas, or constraint logic. It only sees the allowed moves.
- A **spectrum from rigid to latent** is supported via four constraint forms: JSON Schema (structural), CEL (logical), imperative function (programmatic), and prompt (LLM-evaluated).
- **Joint compilation** (when both mandates are known) is an explicit, opt-in special case supported via the `@statespace/explorer` study API.

### Non-goals

- This package does not implement the NBC wire protocol. That is `@khoralabs/obp-v2-nbc` and `@khoralabs/obp-v2-frames-impl`.
- This package does not persist OBP graph state. That is `@khoralabs/obp-v2-persistence`.
- This package does not implement the LLM agent itself. It supplies the policy layer the LLM operates within.

---

## 2. Protocol semantics

### 2.1 The bimodal turn

Each NBC turn (`NbcTurnBody`) combines two independent decisions in a single message:

- **Propose** (outbound): extend one offer, expose zero or more ports on it. This signals to the counterparty what affordances you are making available. Each port carries a `bind_policy` JSON Schema specifying the shape of payload required from the binder.
- **Accept** (inbound, optional): bind one of the counterparty's currently exposed, unexpired ports, providing a `bind_payload` that satisfies their port's `bind_policy`.

These decisions are **logically independent** and governed by separate parts of the mandate.

### 2.2 Directionality of binding

Binding a counterparty's port does **not** obligate the binder's next action. It confirms that the binder accepts the affordance offered. The counterparty (whose port was bound) then decides independently — based on their own mandate — what to propose next. Neither party's future moves are determined by the other's bind; they are determined entirely by each party's own mandate evaluated against the current observable state.

### 2.3 Finding common ground

The protocol is a **distributed search** for mutual satisfiability:

- Each party exposes ports signaling what they can offer.
- Each party attempts to bind ports the other has exposed.
- The session terminates with common ground found if both parties successfully bind something they can accommodate.
- The session reaches natural stop (`nbcNaturalStop`) if neither party has any remaining bindable ports and neither is adding new ones.

Neither party reveals their full mandate. The wire protocol is the search algorithm.

### 2.4 Observable state

Both parties can independently derive the same **observable state** from the shared OBP frame chain. This is the only shared ground truth. It includes all extended offers, exposed ports (including their `bind_policy` schemas), and all commits binds (including their payloads).

The `bind_policy` JSON Schema **is transmitted on the wire** in `NbcPortSpec`. The binder can see the schema before deciding to bind. Only the custom semantic validation logic (`NbcBindPolicyValidateFn`) remains private.

---

## 3. State model

### 3.1 `NbcObservableState`

The shared, derivable-from-wire state:

```typescript
type NbcObservableOffer = {
  id: string;
  type: string;
  partyId: string;
  expiresAfterTurn: number;
  expiresAtRelayMs: number;
};

type NbcObservablePort = {
  id: string;
  offerId: string;
  type: string;
  promise: string;
  ref: string;
  exposed: boolean;
  expiresAfterTurn: number;
  expiresAtRelayMs: number;
  bindPolicy: unknown; // JSON Schema — visible to binder from the wire
};

type NbcObservableBind = {
  offerId: string;
  portId: string;
  payload: unknown; // the binder's message, satisfying bindPolicy
};

type NbcObservableState = {
  turn: number;
  relayMs: number;
  currentActor: "initiator" | "responder";
  offers: Record<string, NbcObservableOffer>; // keyed by offer id
  ports: Record<string, NbcObservablePort>;   // keyed by port id
  binds: NbcObservableBind[];
};
```

### 3.2 `NbcDerivedState`

State **derived from bind events** via effects. Populated automatically when the mandate guard processes an incoming turn. These fields enable CEL constraints to reference bind history without re-traversing the `binds` array:

```typescript
type NbcDerivedState = {
  // Port ids that have been bound by any party
  boundPortIds: string[];
  // Keyed by symbolic port name (developer-assigned) → extracted payload fields
  bindPayloads: Record<string, unknown>;
};
```

These fields are populated by `onBound` effect definitions on each port (see section 5.3).

### 3.3 `LocalMandateState`

Private, never transmitted. Each mandate developer extends this with whatever tracking their policy requires:

```typescript
type LocalMandateState = Record<string, unknown>;
// e.g. { budget: 1000, proposalCount: 0, qualityRequirements: "grade-A" }
```

### 3.4 `NbcMandateState<TLocal>`

The combined state passed to all constraint and effect evaluation:

```typescript
type NbcMandateState<TLocal extends LocalMandateState = LocalMandateState> = {
  observable: NbcObservableState;
  derived: NbcDerivedState;
  local: TLocal;
};
```

This is the `TState` type parameter for all `StateSpace`, `Constraint`, `Effect`, and `Transition` types in this package.

---

## 4. Constraint language

Constraints on `NbcMandateState<TLocal>` support four forms via the existing `Constraint<TState>` type (extended in `@statespace/core`):

### 4.1 JSON Schema (`Schema`)

Structural validation. Used when the constraint is a shape check on a state field — e.g., "this field must be a non-negative integer." Evaluated synchronously by Ajv.

```typescript
validation: { type: "number", minimum: 0, maximum: 10 }
```

### 4.2 CEL expression (`CelExpression`)

Logical validation against the full state. Used for ordering dependencies, cross-field checks, and bind history queries. Evaluated synchronously by `cel-js` via `getCelCst` (cached parse).

```typescript
// Port can only be exposed after "price-port" has been bound
validation: { cel: '"price-port" in derived.boundPortIds' }

// Only accept if budget can cover the promised price
validation: { cel: 'double(observable.ports[portId].promise) <= local.budget' }

// Max 5 proposals
validation: { cel: 'local.proposalCount < 5' }
```

The CEL context is the full `NbcMandateState` object, keyed as `observable`, `derived`, `local`. Additionally, the current `portId` or `offerId` being evaluated is injected as a top-level key.

### 4.3 Imperative function (`ConstraintFn`)

Arbitrary synchronous TypeScript. Used when CEL cannot express the logic — complex array operations, external lookups, etc.

```typescript
validation: (path, state, phase) => {
  const price = state.derived.bindPayloads["price-port"]?.proposed_price;
  return ConstraintRepository.formatResult({
    isValid: typeof price === "number" && price >= 500,
    state, phase, path,
    message: "price must be at least 500"
  });
}
```

### 4.4 Prompt constraint (`PromptConstraint`) — new type

Soft, LLM-evaluated validation. Used when the constraint requires semantic judgment that cannot be expressed in code. The prompt is a template string with `{{path.to.state}}` interpolations resolved against the current `NbcMandateState`.

```typescript
export type PromptConstraint = { prompt: string };

validation: {
  prompt: `The counterparty is offering: {{observable.ports[portId].promise}}.
           We agreed to pay: {{derived.bindPayloads["price-port"].proposed_price}}.
           Our quality requirements are: {{local.qualityRequirements}}.
           Should we accept these terms? Answer yes or no.`
}
```

**Evaluation**: The `MandateGuard` (initialized with an LLM client) renders the prompt template, appends the full serialized current state as context, calls the LLM, and parses the response for a yes/no signal. The response is treated as a `ConstraintResult`.

**The prompt-evaluating LLM is not the same as the strategy LLM.** A fast, cheap model can evaluate constraint prompts. A more capable model handles strategy selection. They are configured separately on the `MandateGuard`.

**Async evaluation**: Prompt constraints are inherently async. The `MandateGuard.allowedMoves()` method is therefore async. The `ConstraintFn` signature in the core should accommodate async evaluation, or prompt constraints are evaluated by the guard before/after the synchronous constraint layer. See section 8.2 for the async evaluation design.

#### Extension to `Constraint<TState>` in `@statespace/core`:

```typescript
// constraint/domain.ts — add to validation union:
export type PromptConstraint = { prompt: string };

export type Constraint<TState extends object> = {
  [P in Path<TState>]: {
    phase: "before_transition" | "after_transition";
    path: P;
    validation:
      | Schema<Value<TState, P>>
      | ConstraintFn<TState, P>
      | CelExpression
      | PromptConstraint;   // new
    message?: string;
  };
}[Path<TState>];
```

---

## 5. Port definitions

### 5.1 `NbcPortDefinition`

A port template in the mandate. Ports are **symbolic** within the mandate (developer-assigned stable names), mapped to actual OBP UUIDs at runtime.

```typescript
type NbcPortDefinition<TLocal extends LocalMandateState = LocalMandateState> = {
  // Stable symbolic name within this mandate (used in constraints/effects)
  name: string;

  // OBP wire type — conventionally namespaced, e.g. "com.example.price-negotiation"
  type: string;

  // What this port promises to the binder (static string or CEL expression)
  promise: string | CelExpression;

  // JSON Schema communicated to the counterparty on the wire.
  // Defines the shape of bind_payload required. Also used by mandate guard
  // to check structural compliance before attempting to bind a counterparty's port.
  bindPolicy: Record<string, unknown> | null;

  // Effects applied to NbcMandateState when THIS party's instance of this
  // port is bound by the counterparty. Used to extract payload into derived state.
  onBound?: Effect<NbcMandateState<TLocal>>[];

  // Constraints evaluated before THIS party exposes this port (propose path).
  exposeConstraints?: Constraint<NbcMandateState<TLocal>>[];

  // Constraints evaluated before THIS party binds a counterparty port of this type
  // (accept path). The current counterparty port id is available as `portId` in CEL.
  acceptConstraints?: Constraint<NbcMandateState<TLocal>>[];
};
```

### 5.2 Symbolic IDs vs runtime UUIDs

Port `name` is the mandate-internal identifier used in constraints and effect paths. At runtime, each `NbcPortDefinition` is instantiated with a deterministic OBP UUID derived from:

```
uuid5(namespace: MANDATE_NS, name: `${partyId}:${offerSequence}:${portName}`)
```

This makes IDs stable and reproducible while remaining valid OBP UUIDs. The mapping from symbolic name → runtime ID is maintained in local state:

```typescript
// In local state, tracked automatically by the mandate guard:
local._portIds: Record<string, string>  // symbolic name → runtime UUID
local._offerIds: Record<string, string> // symbolic name → runtime UUID
```

CEL expressions use symbolic names (e.g., `'"price-port" in derived.boundPortIds'`). The guard resolves them to runtime IDs when constructing `NbcTurnBody`.

### 5.3 `onBound` effects

When the counterparty binds one of your ports, the guard fires the port's `onBound` effects to update `NbcMandateState`. This is how bind payload data enters the state and becomes available to subsequent constraints:

```typescript
// Example: price-port onBound effects
onBound: [
  // Record the symbolic name in boundPortIds
  {
    path: "derived.boundPortIds",
    operation: "transform",
    value: (path, state) => ({
      success: true,
      state: {
        ...state,
        derived: {
          ...state.derived,
          boundPortIds: [...state.derived.boundPortIds, "price-port"]
        }
      }
    })
  },
  // Extract payload fields into derived.bindPayloads
  {
    path: "derived.bindPayloads.price-port",
    operation: "set",
    value: { cel: 'observable.binds.filter(b, b.portId == _portIds["price-port"])[0].payload' }
  }
]
```

CEL effects using `$path` or `{ cel: ... }` have access to `_portIds` and `_offerIds` for resolution. The `onBound` effects are applied in order; each receives the state produced by the previous.

---

## 6. Offer definitions

### 6.1 `NbcOfferDefinition`

An offer template in the mandate. Each turn extends exactly one offer and exposes its ports:

```typescript
type NbcOfferDefinition<TLocal extends LocalMandateState = LocalMandateState> = {
  // Symbolic name for this offer template
  name: string;

  // OBP offer type
  type: string;

  // Which port templates (by symbolic name) to expose on this offer
  ports: string[];

  // Constraints evaluated before this offer is extended (propose path)
  constraints?: Constraint<NbcMandateState<TLocal>>[];

  // Effects applied when this offer is extended, e.g. increment proposal counter
  effects?: Effect<NbcMandateState<TLocal>>[];
};
```

### 6.2 Propose transition semantics

When the guard evaluates whether an offer template is valid, it checks:
1. The offer's `constraints` (before_transition phase).
2. For each port in `offer.ports`: the port's `exposeConstraints`.

An offer is **proposable** only if all its constraints and all its ports' expose constraints pass. The LLM picks from the set of proposable offers.

---

## 7. Mandate definition

### 7.1 `NbcMandate<TLocal>`

```typescript
type NbcMandate<TLocal extends LocalMandateState = LocalMandateState> = {
  // JSON Schema for the full NbcMandateState<TLocal>
  shape: Schema<NbcMandateState<TLocal>>;

  // Initial value for the private local state
  initialLocal: TLocal;

  // Port templates available in this mandate
  ports: NbcPortDefinition<TLocal>[];

  // Offer templates available in this mandate
  offers: NbcOfferDefinition<TLocal>[];

  // Which actor role this mandate governs
  actor: "initiator" | "responder";
};
```

### 7.2 `defineNbcMandate` helper

```typescript
function defineNbcMandate<TLocal extends LocalMandateState>(
  mandate: NbcMandate<TLocal>
): NbcMandate<TLocal>;
```

Validates the mandate definition at definition time:
- All port names referenced in offers exist in `mandate.ports`.
- All CEL expressions parse without error (using `getCelCst`).
- All prompt templates contain only valid interpolation syntax.
- Throws with a descriptive error on any violation.

---

## 8. Compilation and the `MandateGuard`

### 8.1 `compileMandateGuard`

```typescript
type MandateGuardConfig = {
  // LLM client for evaluating PromptConstraint validations
  constraintLlm?: LlmClient;
  // LLM client for strategy selection (not used by guard directly, passed through)
  strategyLlm?: LlmClient;
};

function compileMandateGuard<TLocal extends LocalMandateState>(
  mandate: NbcMandate<TLocal>,
  config?: MandateGuardConfig
): MandateGuard<TLocal>;
```

Internally, `compileMandateGuard`:
1. Derives a `StateSpace<NbcMandateState<TLocal>>` from the mandate by converting offer and port definitions into `Transition<NbcMandateState<TLocal>>[]`.
2. Calls `StateSpaceRepository.makeExecutable` to compile transitions.
3. Wraps the executable transitions in the `MandateGuard` interface.

### 8.2 `MandateGuard<TLocal>`

```typescript
type TurnDecision<TLocal extends LocalMandateState> = {
  // Offers (with ports) the LLM may propose
  proposable: ProposableOffer[];

  // Counterparty ports the LLM may bind
  bindable: BindablePort[];

  // Current state snapshot (for LLM context — never includes private mandate logic)
  observableState: NbcObservableState;
};

type ProposableOffer = {
  name: string;
  type: string;
  ports: Array<{
    name: string;
    type: string;
    promise: string;
    bindPolicy: unknown;
  }>;
};

type BindablePort = {
  portId: string;       // runtime OBP UUID
  type: string;
  promise: string;
  bindPolicy: unknown;  // JSON Schema from the counterparty's port spec
  // Payload template: schema-derived skeleton the LLM fills in
  payloadSchema: unknown;
};

type MandateGuard<TLocal extends LocalMandateState> = {
  // Given current state, compute all allowed moves. Async because PromptConstraints
  // may require LLM evaluation.
  allowedMoves(
    state: NbcMandateState<TLocal>
  ): Promise<TurnDecision<TLocal>>;

  // Apply a chosen move to local+derived state (does NOT write to OBP persistence;
  // that is the caller's responsibility via applyNbcTurn).
  applyPropose(
    state: NbcMandateState<TLocal>,
    offerName: string
  ): { success: true; nextState: NbcMandateState<TLocal>; turn: NbcTurnBodyProposal }
   | { success: false; reason: string };

  applyAccept(
    state: NbcMandateState<TLocal>,
    portId: string,
    payload: unknown
  ): { success: true; nextState: NbcMandateState<TLocal>; bindPortId: string; bindPayload: unknown }
   | { success: false; reason: string };

  // Process an incoming counterparty turn: update observable state,
  // fire onBound effects for any ports that were bound in this turn.
  applyIncomingTurn(
    state: NbcMandateState<TLocal>,
    incomingTurn: NbcTurnBody,
    updatedObservable: NbcObservableState
  ): Promise<NbcMandateState<TLocal>>;
};
```

### 8.3 Async constraint evaluation strategy

Prompt constraints are the only async constraint form. To avoid making the entire synchronous `ConstraintFn` chain async, the guard evaluates them in a two-pass approach:

1. **Pass 1 (sync)**: evaluate Schema, CEL, and ConstraintFn constraints. Collect all PromptConstraint nodes that would be reached.
2. **Pass 2 (async, parallel)**: evaluate all collected prompt constraints in parallel via the constraint LLM.
3. **Merge**: re-run pass 1 substituting prompt results; filter final allowed moves.

This keeps the core constraint evaluation layer synchronous while layering async prompt evaluation on top in the guard.

### 8.4 `NbcTurnBodyProposal`

An intermediate type produced by `applyPropose` before the LLM selects bind details:

```typescript
type NbcTurnBodyProposal = {
  offer: NbcOfferSpec;
  ports: NbcPortSpec[];
  // bind_port_id and bind_payload are filled in by the strategy LLM
  // from the TurnDecision.bindable list
};
```

The final `NbcTurnBody` is assembled by the agent runtime, combining the proposal from `applyPropose` with the bind decision from `applyAccept`.

---

## 9. Constraint evaluation against `NbcMandateState`

### 9.1 CEL context

All CEL expressions in constraints and effects receive the following top-level keys:

| Key | Value |
|---|---|
| `observable` | `NbcObservableState` |
| `derived` | `NbcDerivedState` |
| `local` | `TLocal` |
| `portId` | runtime UUID of the port being evaluated (for accept constraints) |
| `offerId` | runtime UUID of the offer being evaluated (for offer constraints) |
| `_portIds` | `Record<string, string>` — symbolic name → runtime UUID |
| `_offerIds` | `Record<string, string>` — symbolic name → runtime UUID |

### 9.2 Constraint phases

- **`before_transition`**: evaluated against the current state before the effect is applied. Used for preconditions ("can I do this?").
- **`after_transition`**: evaluated against the state after the effect is applied. Used for postconditions ("did this produce a valid state?").

For propose transitions: before = before the offer is extended in local state; after = after local state is updated.
For accept transitions: before = before the bind is committed to local state; after = after local state reflects the bind.

---

## 10. Effect language for NBC

### 10.1 Supported effect forms

All existing `@statespace/core` effect operations apply: `set`, `add`, `subtract`, `multiply`, `divide`, `append`, `prepend`, `cut`, `transform`. The `value` field of each may be:
- A literal value
- A `$path` reference (e.g., `"$local.budget"`)
- A `CelExpression` (e.g., `{ cel: "local.budget * 0.9" }`)
- An `EffectFn` (for `transform`)

### 10.2 Typical `onBound` effect pattern

When the counterparty binds your port, you typically want to:
1. Record the symbolic port name in `derived.boundPortIds`.
2. Extract the payload into `derived.bindPayloads.<portName>`.
3. Optionally update `local` state (e.g., increment a counter).

```typescript
onBound: [
  {
    path: "derived.bindPayloads.price-port",
    operation: "set",
    value: {
      cel: 'observable.binds.filter(b, b.portId == _portIds["price-port"])[0].payload'
    }
  },
  {
    path: "local.inboundBindCount",
    operation: "add",
    value: 1
  }
]
```

### 10.3 Propose effects

Offer definitions may include `effects` that fire when the offer is proposed (e.g., incrementing `local.proposalCount`):

```typescript
effects: [
  { path: "local.proposalCount", operation: "add", value: 1 }
]
```

---

## 11. The constraint rigidity spectrum

The spectrum is controlled entirely by how many constraints are added and what form they take. No separate code paths or API modes are needed.

### 11.1 Fully latent (no constraints)

```typescript
defineNbcMandate({
  offers: [{
    name: "open-offer",
    type: "open",
    ports: ["open-port"],
    constraints: []  // always proposable
  }],
  ports: [{
    name: "open-port",
    type: "open",
    bindPolicy: null,
    exposeConstraints: [],
    acceptConstraints: []  // always bindable
  }]
});
```

The mandate guard returns all offers as proposable and all counterparty ports as bindable (structural match only). The LLM has complete latitude.

### 11.2 Fully symbolic (all moves policy-determined)

Every transition is gated by CEL constraints referencing prior bind history. At most one offer and one bind are valid at any state. The LLM has no choices — it executes the single valid move. Equivalent to a deterministic protocol automaton.

### 11.3 Mixed (practical default)

Core protocol ordering encoded in CEL (rigid spine), with semantic acceptance decisions delegated to prompt constraints (soft edges):

```typescript
{
  name: "accept-delivery-terms",
  type: "delivery-terms",
  bindPolicy: { type: "object", required: ["delivery_date", "method"] },

  acceptConstraints: [
    // Hard: price must have been agreed first
    {
      path: "derived.boundPortIds",
      phase: "before_transition",
      validation: { cel: '"price-port" in derived.boundPortIds' }
    },
    // Hard: structural — can we produce a conforming payload?
    {
      path: "local.canShip",
      phase: "before_transition",
      validation: { cel: "local.canShip == true" }
    },
    // Soft: semantic — does the delivery promise suit our needs?
    {
      path: "observable",
      phase: "before_transition",
      validation: {
        prompt: `The counterparty is proposing delivery via {{observable.ports[portId].promise}}.
                 We need delivery within {{local.maxDeliveryDays}} days.
                 Is this delivery promise acceptable? Answer yes or no.`
      }
    }
  ]
}
```

---

## 12. Explorer and simulation

The `@statespace/explorer` package remains the tool for **offline analysis and testing**. It is never required for production use of `MandateGuard`.

### 12.1 Per-party reachability analysis

Given a mandate and a **synthetic counterparty model** (not the real counterparty's mandate), you can explore the space of reachable outcomes:

```typescript
import { Explorer } from "@statespace/explorer";
import { bfs } from "@statespace/bfs";

// Synthetic counterparty: accepts anything, proposes whatever you need
const syntheticCounterparty = defineNbcMandate({
  actor: "responder",
  offers: [{ name: "any", type: "any", ports: ["any-port"], constraints: [] }],
  ports: [{ name: "any-port", type: "*", bindPolicy: null, acceptConstraints: [] }]
});

const combinedStateSpace = interleaveByActor(myMandate, syntheticCounterparty);

const explorer = new Explorer(
  StateSpaceRepository.makeExecutable(combinedStateSpace),
  jsonCodex()
);

const graph = await explorer.study(bfs, {
  initialState,
  exitConditions: [nbcNaturalStop]
});
// graph reveals all states reachable given a cooperative counterparty
```

### 12.2 Joint compilation (pre-known mandates)

When both mandates are known (same organization, audit, or explicit mutual disclosure), the full joint state space is enumerable:

```typescript
function compileJointStateSpace<TLocal extends LocalMandateState>(
  initiator: NbcMandate<TLocal>,
  responder: NbcMandate<TLocal>,
  initialState: NbcMandateState<TLocal>
): Promise<{
  graph: MarkovGraph;
  // Given a state hash, the pre-computed allowed moves for each actor
  allowedChoices(hash: Hash, actor: "initiator" | "responder"): TurnDecision<TLocal>[];
  decode(hash: Hash): Promise<NbcMandateState<TLocal>>;
}>;
```

This is a strict special case. In production with private mandates, each party independently runs `compileMandateGuard`.

### 12.3 Deadlock detection

A mandate can be checked for deadlock against a synthetic counterparty:

```typescript
async function detectDeadlock<TLocal extends LocalMandateState>(
  mandate: NbcMandate<TLocal>,
  counterpartyModel: NbcMandate<TLocal>,
  initialState: NbcMandateState<TLocal>
): Promise<{ deadlocked: boolean; reason?: string }>;
```

Returns `{ deadlocked: true }` if no path through the joint state space reaches a successful mutual bind.

---

## 13. Agent runtime integration

### 13.1 Per-turn loop

```typescript
async function runNbcAgentTurn(
  guard: MandateGuard<TLocal>,
  state: NbcMandateState<TLocal>,
  strategyLlm: LlmClient,
  handle: FrameSessionHandle
): Promise<NbcMandateState<TLocal>> {

  // 1. Compute allowed moves (async — may evaluate prompt constraints)
  const decision = await guard.allowedMoves(state);

  // 2. LLM selects from allowed moves (only sees decision, not the mandate)
  const chosen = await strategyLlm.selectMove(decision);

  // 3. Guard validates and assembles the turn body
  const proposeResult = guard.applyPropose(state, chosen.offerName);
  const acceptResult = chosen.bindPortId
    ? guard.applyAccept(proposeResult.nextState, chosen.bindPortId, chosen.bindPayload)
    : null;

  // 4. Assemble NbcTurnBody
  const turnBody: NbcTurnBody = {
    ...proposeResult.turn,
    bind_port_id: acceptResult?.bindPortId ?? "",
    bind_payload: acceptResult?.bindPayload ?? null,
  };

  // 5. Send over wire
  await handle.sendTurn(turnBody);

  // 6. Return updated local+derived state
  return acceptResult?.nextState ?? proposeResult.nextState;
}
```

### 13.2 Handling incoming turns

When the counterparty's turn arrives:

```typescript
async function handleIncomingTurn(
  guard: MandateGuard<TLocal>,
  state: NbcMandateState<TLocal>,
  incomingTurn: NbcTurnBody,
  persistenceClient: ObpPersistenceClient
): Promise<NbcMandateState<TLocal>> {

  // 1. Apply NBC invariants and persist to OBP graph (existing NBC layer)
  await applyNbcTurn({ partyId, body: incomingTurn, client: persistenceClient, timing });

  // 2. Derive updated observable state from persistence
  const updatedObservable = await deriveObservableState(persistenceClient);

  // 3. Apply mandate guard's onBound effects and update derived state
  return guard.applyIncomingTurn(state, incomingTurn, updatedObservable);
}
```

The mandate guard's `applyIncomingTurn` fires `onBound` effects for any ports that were bound in the incoming turn, updating `derived.boundPortIds` and `derived.bindPayloads`.

---

## 14. Package structure

```
packages/nbc/
├── src/
│   ├── index.ts
│   ├── domain.ts          # NbcMandate, NbcPortDefinition, NbcOfferDefinition,
│   │                      #   NbcMandateState, TurnDecision, MandateGuard types
│   ├── state.ts           # NbcObservableState, NbcDerivedState, deriveObservableState
│   ├── adapters.ts        # compileMandateGuard, defineNbcMandate
│   ├── interleave.ts      # interleaveByActor (for Explorer simulation)
│   ├── joint.ts           # compileJointStateSpace, detectDeadlock
│   ├── prompt.ts          # PromptConstraint evaluation, template rendering
│   └── _tests/
│       ├── mandate.test.ts
│       ├── guard.test.ts
│       └── simulation.test.ts
└── package.json
```

### Dependencies

```json
{
  "dependencies": {
    "@statespace/core": "*",
    "@statespace/explorer": "*",
    "@khoralabs/obp-v2-nbc": "*",
    "@khoralabs/obp-v2-persistence": "*",
    "@khoralabs/obp-v2-model": "*"
  }
}
```

---

## 15. Key design decisions

### 15.1 `PromptConstraint` is a first-class form

Alternatives considered:
- **Just use `ConstraintFn`**: loses serializability, tooling visibility, and the LLM-dependency boundary.
- **Higher-order function factory**: `createPromptConstraint(prompt)` returning a `ConstraintFn`. Functionally equivalent but loses the tagged-object consistency with `CelExpression`.

Decision: `{ prompt: string }` is the fourth form of `validation`, consistent with `{ cel: string }`. Tooling can inspect whether a mandate contains prompt constraints and warn accordingly.

### 15.2 Symbolic port names, not UUIDs in the mandate

Alternatives considered:
- **Developer assigns UUIDs**: makes mandates UUID-coupled to specific deployments. Constraints referencing `'"550e8400-e29b-41d4-a716-446655440000" in derived.boundPortIds'` are unreadable and brittle.
- **Port names resolved at runtime**: chosen approach. Stable, human-readable, derivable to UUIDs via deterministic UUID5.

### 15.3 `onBound` as effects, not a callback

Alternatives considered:
- **Callback function `onBound(state, payload) => state`**: imperative, loses effect traceability and cannot be inspected by tooling.
- **Effects array**: chosen approach. Composable with existing `@statespace/core` effect types, supports CEL value extraction, visible to the state machine introspection layer.

### 15.4 `applyPropose` and `applyAccept` are separate methods

Alternatives considered:
- **Single `applyTurn(state, decision)`**: loses the ability to validate propose and accept independently, and makes partial validation harder.
- **Separate methods**: chosen approach. The agent runtime combines them into a single `NbcTurnBody`. Each can fail independently.

### 15.5 Guard does not write to OBP persistence

The guard is a pure state machine over `NbcMandateState`. Writing to OBP persistence remains the responsibility of `applyNbcTurn` from `@khoralabs/obp-v2-nbc`. The guard's local state and OBP graph state are kept in sync by `applyIncomingTurn` and `handleIncomingTurn` in the agent runtime. This preserves the layering from the OBP stack.
