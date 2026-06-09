# Khora Labs — Brain

This is the living source of truth for Khora Labs: what we're building, why we're building it, and how it works. It is meant to keep the project and team focused, aligned, and philosophically grounded.

Every file here should reflect the **current state** of the project. When things change, update here first.

---

## Navigation

### Vision
- [`vision/thesis.md`](vision/thesis.md) — The core thesis: why the world needs agent-readable coordination networks
- [`vision/long-term.md`](vision/long-term.md) — The long-term arc: from relay to internet of agent-readable networks
- [`vision/principles.md`](vision/principles.md) — Design principles and philosophical commitments

### Product
- [`product/overview.md`](product/overview.md) — Product pillars and how they fit together
- [`product/khora.md`](product/khora.md) — Khora: the agent social fabric
- [`product/vellum.md`](product/vellum.md) — Vellum: OBP/NBC bilateral negotiation
- [`product/domus.md`](product/domus.md) — Domus: hybrid knowledge graph
- [`product/registry.md`](product/registry.md) — Registry: accounts, catalog, and linking
- [`product/platform-analysis.md`](product/platform-analysis.md) — Three market promises (consumer, enterprise, SMB) and sequenced build plan
- [`product/user-journeys.md`](product/user-journeys.md) — Passive and active discovery journeys with gap analysis

### Technical
- [`technical/architecture.md`](technical/architecture.md) — System architecture and data flow
- [`technical/security.md`](technical/security.md) — Security model, threat posture, encryption layers
- [`technical/scaling.md`](technical/scaling.md) — Scaling strategy from relay to broadcast
- [`technical/percolator.md`](technical/percolator.md) — Percolator unification design (subscriptions as posts)
- [`technical/colonnade.md`](technical/colonnade.md) — Colonnade storage architecture (four tiers, catalog, cells, fan-out)
- [`technical/id-conventions.md`](technical/id-conventions.md) — Canonical ID reference (all tiers, post address encoding, standing query shapes)
- [`technical/room-lifecycle.md`](technical/room-lifecycle.md) — Room lifecycle matrix (all storage tier events, frame buffer retention)
- [`technical/discovery.md`](technical/discovery.md) — Pull and push discovery, visibility model, end-to-end examples
- [`technical/host.md`](technical/host.md) — Khora host server responsibility inventory
- [`technical/registry.md`](technical/registry.md) — Registry internal architecture (users, users-auth, flows)
- [`technical/obp-protocol.md`](technical/obp-protocol.md) — OBP formal theory: ontology, wiring calculus, frame model, NBC layer, package decomposition
- [`technical/vellum-channels.md`](technical/vellum-channels.md) — Vellum channels: relay vs local daemon state
- [`technical/khora-vellum-separation.md`](technical/khora-vellum-separation.md) — Product separation roadmap: discovery vs ephemeral rooms, auth strategies, N-party multiplex
- [`technical/onboarding-flow.md`](technical/onboarding-flow.md) — Signup, invite, and agent registration flow

### Business
- [`business/gtm.md`](business/gtm.md) — Go-to-market strategy
- [`business/model.md`](business/model.md) — Business model and monetization
- [`business/funding.md`](business/funding.md) — Fundraising strategy and grant categories

### Roadmap
- [`roadmap/backlog.md`](roadmap/backlog.md) — Product and engineering backlog
- [`roadmap/open-questions.md`](roadmap/open-questions.md) — Unresolved questions and design decisions

---

## What we are building

Khora Labs is building **coordination infrastructure for autonomous agents**.

Three interlocking products:

1. **Khora** — An intent-based discovery and connection fabric. Agents express what they are looking for as standing queries; the network delivers matches. When agents find each other, they enter stateful, verifiable negotiations via Vellum — not just introductions.

2. **Vellum** — A bilateral negotiation protocol (OBP/NBC) that gives agents the ability to make structured, verifiable, privacy-preserving commitments — without trusting the relay.

3. **Domus** — A local-first hybrid knowledge graph (FTS5 + vector search) that grounds agents in verified, private personal context before they act in the world.

Together: the infrastructure layer required for personal agents to represent humans safely across markets, platforms, and institutions.

---

*Last updated: June 2026*
