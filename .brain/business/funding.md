# Fundraising Strategy

## Grant categories (by fit)

### 1. Technologies for Trustworthy AI / AI Safety Infrastructure (Highest fit)

**Funders:** NSF, DARPA, Sloan, MacArthur, Open Philanthropy, a16z CSX, SV Angel  
**Programs:** NSF AI7 & AI8

**The frame:** "We're building the cryptographic accountability layer for the agentic web."

**The case:**
- Vellum's OBP/NBC creates cryptographically verifiable, signed causal records of agent-to-agent agreements — the audit trail that regulators and enterprises need for "who authorized what"
- E2EE frame channels + local SQLite state means the relay never sees negotiation content — privacy-preserving by architecture
- DID-keyed identities + Ed25519 request signing = identity accountability without centralized auth
- The absence of this infrastructure is a systemic vulnerability — as agents gain authority to commit resources, there is no equivalent of a signed contract for machine-to-machine interactions

---

### 2. Decentralized Identity & Digital Infrastructure (High fit)

**Funders:** DHS SBIR, NIST, Ethereum Foundation, Internet Archive Foundation, Mozilla Foundation

**The frame:** "DID for humans was Web3. DID for agents is what comes next, and it needs open infrastructure."

**The case:**
- Khora implements `did:key` identities for agents — not users. This extends decentralized identity to the agent layer, which has no standard today
- Nonce-protected, signed requests prevent replay attacks — addressing a known vulnerability in agent communication
- Data sovereignty: private keys never leave the user's environment
- Open protocol (OBP/NBC) invites implementation by any party, accelerating standards adoption

---

### 3. Future of Work / Labor Market Innovation (Medium fit)

**Funders:** Lumina Foundation, JPMorgan Chase AdvancingCities, DOL ETA, Schmidt Futures

**The frame:** "Giving every knowledge worker a persistent agent that negotiates on their behalf, not just matches keywords."

**The case:**
- Khora enables worker-controlled agents to negotiate on their behalf — the Knowledge Bazaar is the proof of concept
- NBC's bind-policy enforcement means workers encode constraints (rate floors, work-hour caps) that agents enforce automatically
- Subscription routing + notifications let worker agents continuously monitor for matching opportunities without manual search

---

### 4. Privacy-Preserving AI / Data Minimization (Medium fit)

**Funders:** Mozilla Tech Fund, Privacy Sandbox, EFF, Ford Foundation, CDT

**The frame:** "The first agent network where the relay cannot read negotiation content — E2EE on bilateral frame channels."

**The case:**
- Domus system (FTS5 + sqlite-vec) runs locally — personal knowledge graph never leaves the device; relay sees only encrypted frames
- Value firewall: agent claims grounded in local memory, not exposed to the network in plaintext
- Khora server holds DIDs, profiles, and published posts/subscriptions (operator-readable); negotiation frame bodies stay E2EE — bounded public surface by design

---

## NSF SBIR framing

NSF requires: impact, technological innovation, market pull, scale.

### Impact

Autonomous AI agents are being deployed in consequential domains — healthcare coordination, financial contracting, legal document exchange, hiring, enterprise procurement — without any standardized mechanism for verifying what those agents agreed to, on whose behalf, and under what constraints. No equivalent of a signed contract exists for machine-to-machine interactions.

### Technological innovation

The fundamental research challenge Vellum addresses: how do two autonomous agents, each operating on behalf of a human principal and running in separate, mutually untrusting environments, reach a structured, verifiable, repudiation-resistant commitment — without any trusted third party reading the content of their negotiation? This is not a solved problem.

Novel research contributions:
1. **OBP** — typed DAG for negotiation state with causal edges and enforced invariants; novel formal model distinct from existing negotiation protocols
2. **Merkle-checkpointed session sync** — extends BFT log research to the bilateral two-party agent setting
3. **NBC** — formally specified in Smithy with testable, publishable invariants
4. **Privacy-preserving relay** — architectural guarantee, not a policy commitment

Open research questions requiring funding: formal verification of OBP invariants, multi-party extension (N > 2), value-firewall grounding, regulatory mapping to EU AI Act Article 12.

### Market pull

Evidence of the unmet need:
- **Anthropic's Project Deal (2026)** — demonstrated LLM agents can negotiate structured agreements; concluded that trust, verification, and commitment infrastructure are the critical missing primitives
- **Google A2A + Anthropic MCP** — address capability discovery and tool use; neither provides a commitment or audit layer; A2A and MCP are complementary to Vellum
- **Stripe Agent Payments Protocol (2025)** — financial infrastructure providers recognize agents need transaction primitives; Vellum is the pre-payment coordination layer
- **EU AI Act Article 12 / Annex IV** — mandates logging and record-keeping for high-risk AI; no existing infrastructure satisfies this for agent-to-agent interactions
- **Knowledge Bazaar pilot** — closed cohort validating the core hypothesis

### Scale

Vellum's OBP is a protocol, not a product feature. Like TCP/IP or TLS, its value compounds with adoption. Open-sourcing the spec creates third-party implementations that accelerate adoption beyond a closed product.

**Revenue path:** Vellum API (usage-based, per-bind) + Khora Managed Networks (enterprise contract + usage). Analogous to Stripe + Twilio.

**Scaling path:**
- Phase 1 (now): invite-only developer preview; 10–100 agents; validate protocol + UX
- Phase 2 (6–12 months): open access; SDK drop; first enterprise design partnerships
- Phase 3 (12–24 months): managed network contracts with platform operators; OBP submitted to IETF/W3C as candidate standard
