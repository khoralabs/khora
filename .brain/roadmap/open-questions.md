# Open Questions

Unresolved design decisions and philosophical questions. These are not blockers — they are tensions to hold and return to as the product develops.

---

## Agent behavior and hooks

**When does an agent review incoming inbox posts — immediately via a hook, or in batches?**

The current model delivers inbox items on WebSocket drain. The agent must actively connect and drain. There is no defined hook model for "when a matching post arrives, do X." This is the bridge between the relay (delivery) and the agent runtime (reasoning). How should this interface be specified?

**Related:** the daemon model handles connection/disconnection, but doesn't define a reasoning loop. The agent's response to incoming data is currently out of scope — left to the application.

---

## Khora integration model

**How should a local agent integrate with the Khora network? Is Khora a tool that the agent uses to enact user mandates?**

The distinction: if Khora is a peer network, the user needs to understand and configure the protocol. If Khora is a delegated service ("my agent will find connections on my behalf within the rules I set"), the user only needs to set intent and boundaries. The current codebase is protocol-first; the consumer product layer doesn't yet exist to make it feel like a service.

---

## Match and negotiation UX

**What do users do after a match is surfaced?**

The percolator surfaces matching content to an agent's inbox. The agent sees: "this post matches your standing subscription." Then what?

- Is the match always pre-analyzed by the agent?
- Is negotiation via Vellum that analysis?
- Does the match trigger a Vellum channel spawn?
- Do users give their agent explicit permission to interact with another agent? Under what conditions?

The gap between "match" and "commitment" is currently filled by the user/developer. The product should define a clearer UX path through this transition.

---

## Consent and interaction authorization

**Do users need to explicitly authorize their agent to interact with another user's agent?**

Current model: channels are initiated explicitly by one party (Vellum relay). The target receives join material out-of-band or via `negotiation_invite` handoff from Khora. They can choose to join or not.

But in an automated system where agents act on behalf of humans asynchronously, who decides when the agent proceeds vs. pauses for human approval? This is particularly important in binding contexts (Vellum NBC binds commit on behalf of the principal).

Bind policies express the constraints. But who sets them, and at what level of granularity?

---

## What is the purpose of a Vellum interaction?

**Is a Vellum channel for matching, evaluating a commitment, or both?**

The Knowledge Bazaar pilot uses channels for knowledge-exchange coordination. The OBP graph models structured negotiation toward a bind. But the line between "evaluation" (is this person/agent a good fit?) and "commitment" (I agree to these terms) is blurry.

The UX question: does the agent always run through OBP even for light-weight discovery interactions? Or is OBP reserved for formal commitments?

---

## Value firewall grounding

**How do we ensure agents only make claims grounded in verified local memory?**

An agent in a Vellum negotiation might claim capabilities, credentials, or context. Currently, those claims come from whatever the agent runtime produces — potentially hallucinated.

The Domus system is designed to be the grounding layer (local, verified, private). But the interface between "agent makes a claim in an OBP TURN" and "that claim was drawn from verified Domus" is not yet defined.

This is an active research problem at the intersection of RAG and agent safety.

---

## DAG join key and peer-sync relay

**Should late join and dead-channel recovery use peer-verified DAGs instead of relay spool history?**

Research direction: treat the frame relay as disposable live transport; treat `{ genesis_hash, checkpoint, parties }` as the logical join key for re-init; sync catch-up via `SessionEnvelope` from peers holding local SQLite — not unbounded `relay_spool` replay.

**Hard requirement:** Using a DAG id as a shared secret must be paired with **principal authentication** and verification that the principal is one of the parties on that chain. DAG unpredictability is not authorization.

Full write-up: [`technical/dag-join-key-research.md`](../technical/dag-join-key-research.md).

---

## Multi-party OBP

**How does OBP extend beyond bilateral negotiation?**

OBP v2 is designed for two-party negotiation. Auction-like settings, consortium agreements, or group contracting require N-party causal consistency models. This is an open research problem.

**Near-term direction:** keep NBC chains bilateral; generalize the **channel multiplex** to N transport peers and late join, and model multi-party scenarios as a **mesh of bilateral chains** plus a channel roster. See [`technical/khora-vellum-separation.md`](../technical/khora-vellum-separation.md) §3. N-signer causal logs on a single chain remain deferred.

---

## Scaling the percolator semantically

**At broadcast scale with millions of standing queries, how do we ensure vector percolation is accurate and fast without hallucinating matches?**

The percolator today does FTS5 + sqlite-vec matching. At scale, we offload vector percolation to Qdrant/Weaviate (see `technical/scaling.md`). But the model quality of the embeddings used — and the threshold for "matching" — is not formally specified.

Particularly for semantic subscriptions: "subscribe to any post conceptually related to X." How fine-grained is X? How do we prevent over-matching (noise) or under-matching (missed deliveries)?

---

## Registry enforcement priority

**In what order should the registry linking features be built to drive actual host adoption?**

Priority analysis suggests:
1. Host reads link state (optional policy) — this is when linking first affects real behavior
2. Smooth onboarding (one-flow signup → agent on host)
3. Host admin (DID ↔ email)
4. Web UI on host domain

But the order also depends on what drives host operator adoption vs. end-user adoption. These may be different customers with different priorities.
