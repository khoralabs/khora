# Positioning

## The foundational assumption

**On-device personal agents will become the norm.**

Central model providers and platforms are structurally unable to own the user's full context — either because data never flows to them, or because users will not permit it. In that world, the user's personal agent — aggregating context across devices and thousands of tasks — becomes the most accurate model of that user that exists. No CRM, no behavioral targeting system, no platform profile can compete with a local agent that has been learning from the user for years.

This means companies should not fight users' agents. They should expose the interface agents need to transact quickly and confidently. **The competitive advantage of a platform shifts from owning user data to being the easiest company for a user's agent to do business with.**

The user's DID is the universal join key. When a company first meets a consumer's agent — whether over Khora discovery or a direct Vellum connection — they get a stable, cryptographic identity they can use to maintain their own relationship model. The DID never changes. The company can key all relationship data to it.

---

## The core displacement thesis

Every company today builds products for the ICP they think they have. They capture user context through browser UIs, build coarse personas, and design interfaces for an imagined average customer. The entire stack — data capture, relationship building, UX — is built around that approximation.

**Agents break this model.**

When a consumer's agent interacts with a company's agent, the company no longer controls the interface. The browser UX — the primary mechanism for data capture, context building, and relationship management — is displaced. The consumer's agent brings its own context. The company agent needs to respond to the actual individual, not a persona.

**The NBC chain between the two parties is the new location of that relationship.**

Today:
- Browser UI → data capture, context building
- CRM database → company-owned relationship record
- Persona + rule engine → approximated customer understanding

With Vellum:
- Consumer agent → brings its own context (Domus-grounded)
- Company agent → exposed at the edge, responds to the actual individual
- NBC session chain → the **bilateral, co-authored relationship record** that both parties hold

The NBC chain is not a transaction log. It is the accumulated history of what was negotiated, what was agreed, and what was learned about each other — structured enough for an LLM to reason from, cryptographically verified so neither party can forge it.

---

## Why rule engines can't solve this

A rule engine encodes what the company decided in advance about what customers might need. It scales at the cost of nuance — the more specific the context, the further the rule falls short.

An agent at the edge can understand context it was never explicitly programmed for. But it needs a safe, structured medium to exchange that context and commit to outcomes. That medium is Vellum.

The promise: **companies can build relationships with every individual customer at the edge, and those relationships accumulate as verifiable context** — not in a company-owned database that the customer can never inspect, but in a bilateral NBC chain that both parties hold independently.

---

## Verifiable commitment as the foundation

In addition to relationship context, the NBC chain provides something no rule engine + audit log can: **a co-signed, unforgeable record of what was agreed**.

The company can't later claim it offered different terms. The customer's agent can't claim it didn't accept. The Merkle-checkpointed, bilaterally-signed NBC session is the machine-native equivalent of a signed contract — except it's produced automatically as a byproduct of the negotiation itself.

This matters for:
- **B2C**: discount codes, service commitments, pricing agreements — the customer's agent has proof of what was agreed
- **B2B**: procurement terms, SLAs, supply chain conditions — the NBC record replaces unverifiable email chains
- **Compliance**: EU AI Act Article 12 requires audit trails for high-risk AI agent actions — the NBC chain satisfies this structurally

---

## The positioning hierarchy

1. **Khora** — discovery: *your agent finds the right counterparty without you having to navigate every platform*
2. **Vellum** — commitment: *your agent negotiates and commits on your behalf, producing a verifiable record neither party can dispute*
3. **Domus** — context: *your agent knows you well enough to negotiate correctly, and never exposes your private context to the network*

Together: **the infrastructure layer that makes it safe for agents to replace the browser as the primary interface between people and companies.**

---

## Relationship persistence across sessions

A single NBC chain can span the entire lifecycle of a user's relationship with a company — new offers and binds appended over time to an ongoing channel. Or users may interact over many separate chains for distinct interactions. Both are valid.

In either case, the company's reliable anchor is the user's DID. From first contact (whether through Khora discovery or a direct Vellum connection), the DID is established and stable. The company keys all relationship data to it. The accumulated NBC history across all sessions is the agent-native relationship record — auditable, co-signed, and owned by both parties.

Note: Vellum does not require Khora. Discovery via Khora is one path; direct Vellum connections (without Khora discovery) are also valid. The DID model works in both cases.

---

## Near-term use cases

**B2C retention/negotiation**
A consumer is about to churn. The company's agent detects risk signals and initiates a Vellum session with the consumer's agent. The NBC session negotiates discount terms, service conditions, or product adjustments — guided by the consumer's mandate (what they're actually willing to stay for) and the company's bind policy (what they're authorized to offer). The outcome: a signed commitment both sides hold, and a relationship context that persists beyond this session.

**B2B procurement**
Two companies' agents negotiate supply chain terms peer-to-peer. Price, delivery schedule, quality conditions, penalty clauses. The NBC record replaces email threads and verbal agreements with a signed, causally-ordered chain that both parties can independently verify.

---

## The social unlock (beyond commerce)

Efficient buying is the obvious use case, but it is not the deepest one. The major social unlock of the agentic internet is the ability to **jump outside our small social networks into whatever group is semantically and contextually relevant to us**.

Today, discovery is gated by the networks we already belong to — our existing contacts, the platforms we're on, the feeds we're shown. Intent-based discovery, mediated by local personal algorithms, breaks that constraint. Your agent knows what's relevant to you (Domus) and can find the contextually-aligned counterparty anywhere on the network (Khora), regardless of whether they're in your existing social graph.

This applies far beyond procurement: dating, collaboration, hiring, communities of interest, knowledge exchange. OBP makes any of these tractable because it provides the safe, verifiable medium for the commitment that follows discovery. **The personal algorithm replaces the platform algorithm** — discovery is driven by what your agent knows about you, not by what a platform's engagement-optimizing feed decides to show you.

---

## Market context and the key tension

**External validation.** Anthropic's *Project Deal* (April 2026) ran a live agent-to-agent marketplace — 69 employees, 186 completed deals, agents handling every negotiation. Euclid Ventures' *The Dark Marketplace* (May 2026) argues that agent-mediated commerce will create hundreds of billions in value, led by B2B, and that **judgment abstraction** — encoding per-user, per-context decision-making into an agent — is the defining moat.

**The tension worth being explicit about.** The Dark Marketplace thesis assumes the *vertical AI platform* captures judgment data and owns the relationship: "the system that captures the most judgment data becomes the system of action." Switching costs accrue to the platform.

Khora Labs inverts this. Our foundational assumption is that **the user's on-device personal agent owns the judgment** — aggregated across all their devices, tasks, and contexts, not siloed inside one vertical platform. No single platform can out-learn a personal agent that has watched the user across their entire life.

The two views are not entirely opposed — they converge on the same primitives:
- Both agree memory/judgment is the moat (we locate it on-device; they locate it in the platform)
- Both agree trust shifts from perceptual to empirical (agent track record)
- Both agree B2B procurement is the most tractable near-term wedge
- Both require a safe medium for agent-to-agent negotiation and verifiable commitment

**Where Vellum wins regardless of which view is correct:** even if platforms hold rich judgment data, agent-to-agent negotiation still needs a neutral, verifiable commitment protocol. OBP/NBC is that protocol. We are not betting on owning the judgment layer — we are building the **coordination and commitment substrate** both sides need to transact. If personal agents win, we are their negotiation rail. If platforms win, we are the neutral protocol between platform agents.

### Resolving the tension: the relay's role shifts, it doesn't disappear

The Dark Marketplace article implicitly assumes a *pre-agentic internet with agents bolted on top*. The more likely reality is an internet rebuilt around agents — and in that world hubs and relays retain crucial value, but their role changes.

A local personal agent will **never have enough transactions or relationships to learn global network effects**. It only sees its own principal's experience. Without a hub, every agent is blind to the world outside its own history — there's no way to surface what's trending, what's available, what the market is doing, or who might be relevant but unknown.

So the hub/relay keeps two durable functions:
1. **Network behavior aggregation** — seeing behavior in aggregate across the network, which is exactly what enables pull-based discovery and surfacing of network trends. This aggregate view is itself a sellable asset.
2. **Relationship facilitation** — being the place where agents find each other and where high-trust negotiation rooms are hosted.

The shift is *away from* owning the user's judgment (the local agent does that now) and *toward* relationship facilitation and network-level intelligence. Khora is that hub: it provides the global view no local agent can build, while the personal agent retains the per-user judgment no platform can replicate.

**The Project Deal "agent quality gap" risk.** Anthropic found users represented by weaker models got worse outcomes and couldn't tell. This is the central risk of dark transactions. The Mandate Guard directly addresses it: by making the agent's allowed move set structurally bounded by an inspectable mandate, the outcome space is constrained regardless of model quality. A weaker model inside a tight mandate cannot agree to terms the user didn't authorize.

---

## What this is not

- Not a chat platform for agents
- Not a capability discovery registry (that's A2A)
- Not a tool call protocol (that's MCP)
- Not a payments layer (Stripe handles execution; Vellum handles the pre-payment commitment)

A2A and MCP describe what agents *can do*. Vellum governs what agents *agree to do* — and creates the verifiable record that they did it.
