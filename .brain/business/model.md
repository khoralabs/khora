# Business Model

## Revenue model

Two tiers — developer SaaS and enterprise managed networks.

---

### Tier 1: Vellum API (usage-based)

Charged per-simulation and per-binding event (NBC bind operations in OBP). Targets agent-native builders — AI startups, platform teams, enterprise developers running multi-agent workflows.

Analogous to **Stripe's per-transaction model** — scales directly with agent adoption.

**Free tier (the hook):**
- 10,000 routed messages per month
- 24-hour offline inbox retention
- 5 active standing queries

Captures indie hackers, students, and prototypers. Low barrier to entry; high ceiling for growth.

**Scale tier (the business):**
- Charged based on Percolator compute utilization
- Enterprise: flat monthly compute fee + metered rate per 100k messages
- Example: an enterprise maintaining 500 semantic FTS/vector subscriptions against a global firehose pays for the compute required at scale

---

### Tier 2: Khora Managed Networks (contract + usage)

Private, isolated Khora relay instances for enterprises and matchmaking platforms that need agent coordination infrastructure without building it in-house.

Analogous to **Twilio's managed communication infrastructure**: high ACV, long contracts, compliance-driven procurement.

**Value to enterprise customers:**
- Internal swarm communication completely isolated from the public network
- All architectural benefits of offline inbox and `did:key` routing
- Compliance-ready audit trails (OBP Merkle-checkpointed sessions satisfy EU AI Act Article 12 requirements)
- No vendor lock-in on the protocol — OBP/NBC is open

**Target verticals:** legal, financial services, healthcare coordination, enterprise procurement, hiring platforms

---

## Monetization hooks in the product

| Feature | Monetization angle |
|---------|--------------------|
| Trusted origins quota | N origins included in host subscription; paid extras |
| Paid host catalog listing | Visibility in Khora's public host directory |
| Per-seat or per-linked-agent pricing | Account-level billing for host operators |
| Gated beta | Waitlist → invite → link → register funnel |
| Inbox retention | Default: drain on connect; paid: extended retention windows |
| Standing query quota | Free tier: 5; Scale: unlimited |
| Dedicated shards | Enterprise: private isolated relay instance |

---

## Why the two-tier model works

**Developer tier** acquires the long tail. Open protocol + generous free tier drives organic adoption, community, and protocol network effects. Revenue from scale tier compounds with agent adoption volume.

**Enterprise tier** captures the high-value compliance-driven market. Regulated industries (legal, FinServ, healthcare, hiring) face regulatory requirements (EU AI Act Article 12, Colorado SB24-205, US EO 14110) that demand verifiable audit trails for agent actions. Vellum's OBP is the technical primitive that satisfies those requirements.

These are not competing strategies — the open developer network builds the TAM; the enterprise tier monetizes the compliance use cases that emerge from that TAM.

---

## TAM framing

Global enterprise software intermediation — platforms connecting buyers, sellers, service providers — is a multi-trillion dollar market mediated today by human workflows, SaaS platforms, and manual negotiation. As autonomous agents replace those workflows:

- McKinsey (2024): generative AI could automate 60–70% of knowledge-worker tasks
- The coordination infrastructure for those automated tasks is the layer Vellum is building
- Each platform that replaces human-in-loop with agent-in-loop needs OBP-style commitment infrastructure

**Khora is positioned at the interface** where those agents need to find each other, negotiate, and commit.

---

## Protocol flywheel

Open-sourcing the OBP/NBC spec (while maintaining the managed Khora network and Vellum API as commercial offerings) creates:

1. Third-party implementations accelerate protocol adoption beyond what a closed product achieves
2. Wider adoption increases the value of the Khora identity network for all participants
3. More agents on the network increases the value of the managed network tier for enterprises

The OBP negotiation graph builds over time into a structured history of an agent's commitments. This history compounds in value — switching away from Vellum becomes increasingly costly as commitment history grows.
