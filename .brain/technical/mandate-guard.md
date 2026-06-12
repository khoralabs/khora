# NBC Mandate Guard

The **Mandate Guard** is the policy enforcement layer that sits between the NBC wire protocol and the strategy LLM. It is the mechanism by which an agent becomes **structurally unable to violate its principal's mandate** during a Vellum negotiation.

This is adapted from production work in AI-driven procurement systems and extended for the bilateral NBC setting.

---

## The core insight

An unconstrained LLM negotiating over NBC can produce invalid outcomes — agreeing to terms the user didn't authorise, disclosing information prematurely, or binding ports inconsistent with the user's goals. Policy encoded only in prompt instructions can be violated; the model may hallucinate compliance.

The Mandate Guard solves this by **filtering the allowed move set before the LLM ever sees it**. The LLM picks from a constrained decision set — it cannot choose a move that violates the mandate. Policy is structural, not instructional.

```
Mandate (private) ──→ MandateGuard.allowedMoves() ──→ TurnDecision
                                                              │
                                                     LLM selects strategy
                                                              │
                                               guard.applyPropose / applyAccept
                                                              │
                                                       NbcTurnBody (wire)
```

---

## State model

```
NbcMandateState<TLocal> = {
  observable: NbcObservableState   // derived from the shared OBP frame chain
  derived: NbcDerivedState         // extracted bind payloads, bound port ids
  local: TLocal                    // private, never transmitted
}
```

The `observable` state is the only shared ground truth — both parties independently derive it from the wire. `derived` and `local` are private to each party's guard instance.

---

## Constraint language (rigidity spectrum)

Mandates support four constraint forms, spanning fully deterministic to semantically evaluated:

| Form | Evaluated by | Use case |
|------|-------------|----------|
| JSON Schema | AJV (sync) | Structural field checks |
| CEL expression | cel-js (sync) | Cross-field logic, bind history ordering |
| Imperative function | TypeScript (sync) | Complex array/object operations |
| Prompt constraint | LLM (async) | Semantic judgment that cannot be expressed in code |

The spectrum is controlled by how many constraints are added and what form they take. No special modes are required.

**Key property:** the LLM that evaluates `PromptConstraint` is separate from the strategy LLM. A fast/cheap model handles constraint evaluation; the capable model handles strategy selection.

---

## Domus integration (progressive disclosure)

The `local` state in `TLocal` is the integration point for Domus. When a bind policy requires a payload, the mandate can gate exposure via constraints that query Domus:

```typescript
acceptConstraints: [
  // CEL: only accept if budget allows
  { validation: { cel: "local.budget >= double(observable.ports[portId].promise)" } },

  // Prompt: semantic judgment using Domus context
  { validation: { prompt: `Our quality requirements are: {{local.qualityRequirements}}.
                            The counterparty is promising: {{observable.ports[portId].promise}}.
                            Should we accept? yes/no` } }
]
```

The `local` state is populated from Domus before each turn. The agent discloses only what the mandate permits — Domus never transmits its full graph, only the fields that satisfy mandate constraints.

This is the **semantic firewall**: progressive disclosure governed by declarative policy, not LLM judgment.

---

## Design source

- Procurement agent policy enforcement system (predecessor — semantic forms over agent action spaces)
- `@statespace/core` — state space explorer with transitions, effects, constraints, reachability graphs
- `@khoralabs/agent-capabilities` — capability graph trimming based on policy evaluation

Combining these:
1. A user defines their **goal**, **constraints**, and **disclosure preferences**
2. These compile to a `NbcMandate` with CEL/prompt constraints
3. The `MandateGuard` enforces them structurally during NBC sessions
4. The LLM strategy layer operates within the allowed move set only

---

## Implementation status

**Spec complete.** See `/Users/zach/Documents/dev/cfd/statespace/packages/nbc/SPEC.md` for full type system, constraint evaluation, `MandateGuard` API, and agent runtime integration loop.

**Not yet integrated** into the OBP/Vellum packages in this monorepo. The OBP `bind-policy` package handles JSON Schema port validation (the structural layer); the full `MandateGuard` + state machine + prompt constraint + Domus integration is the next layer to build.

---

## Consumer UX: mandate compilation

For a consumer product, the mandate is never directly authored as a DSL or YAML. It is **compiled** through multiple layers:

1. **Conversational elicitation** — the user's agent asks natural-language questions and drafts a mandate from the answers
2. **Domus-informed** — the agent draws on what Domus has learned about the user in unrelated contexts (values, habits, past decisions) to inform mandate defaults
3. **Negotiation refinement** — as the agent participates in sessions, the user approves/rejects outcomes; the mandate is updated to reflect those preferences over time
4. **Outcome feedback loop** — a bad outcome in a session is evidence that the mandate was too loose; a missed match is evidence it was too tight

The mandate DSL/TypeScript is the **compiled artifact** — what the `MandateGuard` executes. The user interacts with a conversational layer that generates and refines it. The user never reads the compiled mandate, but may be shown summaries ("your agent will not agree to hourly engagements below $150 or disclose your employer without approval").

This creates a living policy: **Domus learns → mandate is refined → negotiation outcomes improve → Domus learns more**.

## Roadmap

1. Port `@statespace/core` state machine + `@statespace/nbc` mandate compiler into `packages/obp/`
2. Add Domus ↔ `local` state binding (Domus query → `TLocal` population before each turn)
3. Add prompt constraint evaluation with configurable constraint LLM
4. Integrate `MandateGuard` into the Vellum daemon per-turn loop
5. Build mandate compilation pipeline: conversation → draft mandate → user approval → live enforcement
6. Add mandate refinement from negotiation outcome feedback
