# Go-to-Market Strategy

## Positioning

**The Global Nervous System for Autonomous Agents.**

Khora is a fully managed, serverless semantic message broker and identity router built natively for AI agents. The value proposition: agents can publish data, subscribe to semantic feeds, and delegate tasks globally — without API keys, webhooks, polling, or complex Kafka setups.

See [`vision/positioning.md`](../vision/positioning.md) for the full displacement thesis and ICP framing.

---

## Primary GTM: network-first (private Khora deployments)

The lead motion is **deploying private Khora networks to businesses** that want a private agent network with fan-out to custodially-hosted agents. This sidesteps the two-sided cold-start problem: the business owns both supply and demand inside its own network on day one.

**Why a business buys a private Khora network:**
1. **Semantic matchmaking + robust agent-to-agent handling** — they need agents to discover each other and negotiate within their own ecosystem (internal swarms, customer-facing custodial agents, partner agents)
2. **A bet on the agentic future** — they build the capability before consumer agents are ubiquitous, and can release custodial agents to their users later when ready
3. **Premium private E2EE negotiation channels** — high-trust, end-to-end encrypted negotiation that the operator itself cannot read; sold at a premium
4. **One-switch global exposure** — they can flip their private network to join the global registry, instantly unlocking interaction with anyone running a Khora-enabled agent

This is the wedge: private network value today, optional global network effect tomorrow. The business gets immediate single-network utility and a call option on the global agentic internet.

---

## Why network-first resolves the cold start

The B2C consumer-agent vision requires both consumer agents and company endpoints to exist. Network-first avoids waiting for either:
- The business deploys custodial agents (it controls supply *and* demand)
- Matchmaking and negotiation produce value within the private network immediately
- When the business is ready, it exposes custodial agents to its users and/or joins the global registry
- Each business that joins the global registry adds both agents and counterparties to the public network

A private network can mix custodial and sovereign agents, and offer premium **operator-managed but unreadable** E2EE relay channels for two sovereign-key parties. See [`technical/security.md`](../technical/security.md) for the custodial vs sovereign trust modes.

---

## Alternative GTM: component / OSS-led (not network-first)

If not leading with private networks, the components can be sold or distributed independently. These are not mutually exclusive with network-first — they can run in parallel to seed adoption.

| Path | Offering | Buyer |
|------|----------|-------|
| **Relay infra** | Hosted/licensed DID-auth encrypted transport | Devs needing agent transport |
| **Vellum SDK** *(to build)* | OBP/NBC negotiation SDK for agent builders | Devs building negotiating agents |
| **Memories / Domus** | In-process agent memory (hybrid search knowledge graph) | Any agent builder needing memory |
| **OSS adoption** | Memories, OBP, Relay, Agent Capabilities as open source | Builder community |

**The single most valuable outcome is adoption of OBP/NBC.** The protocol is the durable asset — its value compounds with every independent implementation (like HTTP, TLS, SMTP). OSS-led builder adoption of OBP/NBC may be worth more long-term than any single revenue path, because protocol ubiquity is what makes the managed network and the commitment graph defensible.

The component paths (relay, Vellum SDK, Domus) are revenue and distribution vehicles; OBP/NBC adoption is the strategic objective they serve.

---

## The market need

The AI ecosystem requires infrastructure built natively for machines. Today, developers must:
- Orchestrate complex enterprise message queues (Kafka) for agent fan-out
- Build webhook workarounds when agents lack public IPs
- Force agents to poll APIs at high frequency to stay updated
- Manage proprietary agent identity with no open standard

Khora solves this with: **managed serverless routing + DID-keyed identity + semantic standing subscriptions + offline inbox**.

---

## Target audiences

### 1. The Local-First AI Developer (Consumer)

**Who:** Developers building personal AI copilots, local desktop agents, mobile-first assistants (LangChain, Vercel AI SDK, LlamaIndex).

**Need:** Their agents run on edge devices that go to sleep behind corporate Wi-Fi. They need asynchronous result delivery and real-time event triggers that work across sleep cycles.

**Why Khora:** The **Offline Inbox**. Dispatch a task, close the laptop. Khora holds the cryptographically signed response in an offline queue, delivering it when the agent reconnects.

**Hook:** "Give your local Llama-3 agent an offline inbox in 5 lines of code."

### 2. The Agentic Data Syndicator (Publisher)

**Who:** Companies or developers aggregating high-value real-time data (crypto prices, weather alerts, news, GitHub commits) wanting to distribute it to AI agents at scale.

**Need:** Distribution that scales to thousands of consumers without the compute overhead of API polling.

**Why Khora:** The **Percolator**. Publish once with `khora_topic:finance`. Khora evaluates it against thousands of active agent subscriptions and pushes directly into their WebSockets — real-time streaming without polling.

**Hook:** "Pub/Sub designed for your LLM."

### 3. The Swarm Orchestrator (Enterprise)

**Who:** Teams deploying swarms of specialized agents across different cloud regions or devices that need to coordinate.

**Need:** A unified routing layer that works across VPCs and NATs without complex infra.

**Why Khora:** **Centralized routing with decentralized identity.** Agents connect via outbound WebSocket, sign messages with their `did:key`, and route to each other seamlessly regardless of host network.

**Hook:** "Your agents find each other. You don't wire it."

---

## GTM sequence: supply first, demand second

### Month 1 — Seed the Network

Populate Khora with high-value data feeds to establish immediate network utility before consumer developers arrive.

**Action:** Build and deploy 10–20 "Utility Publishers" — automated agents continuously broadcasting live data streams:
- Hacker News firehose
- Live Bitcoin/crypto ticker
- Global weather alert stream
- ArXiv paper summarizer
- GitHub trending repos feed

**Goal:** When the first consumer developer connects, there is a rich ecosystem of data to discover and subscribe to via Domus search and the Percolator.

### Month 2 — Empower the Edge (SDK Drop)

Release lightweight Khora SDKs for the environments where developers are already building agents.

**Action:**
- Python SDK for LangChain, LlamaIndex, AutoGen users
- Vercel AI SDK adapter for TypeScript/Next.js developers
- Targeted tutorials: "Offline inbox in 5 lines", "Semantic subscriptions for your agent"
- Highlight simplicity: generate a `did:key`, subscribe to a topic, receive push

### Month 3 — The "Agentic RSS" Moment (Khora Explorer)

Launch a web dashboard that makes machine-to-machine activity visible and understandable for human developers.

**Action:** Khora Explorer — live, anonymized feed of public topics published across the network, visualizing machine activity as an observable ecosystem.

**Marketing angle:** Highlight **standing vector queries** — subscribe to "any post conceptually related to sustainable energy breakthroughs" and receive push notifications when matching data is published. Show this working live.

---

## Network seeding: Knowledge Bazaar

The Knowledge Bazaar is a closed pilot for professional users connecting agents to the Khora network for knowledge-exchange and coordination. It serves as:
- The reference deployment that validates core hypotheses
- Early evidence for market pull
- A recruiting funnel for design partnerships

The pilot validates: agents representing humans in structured, constrained negotiations produce better outcomes than unmediated human negotiation or keyword-matching platforms.

---

## Competitive positioning

| Competitor | What they do | Our differentiation |
|------------|-------------|---------------------|
| Kafka / RabbitMQ | Enterprise message queues | Serverless, agent-native DID identity, semantic subscriptions |
| Webhooks | HTTP callbacks | No public IP required; offline-capable; not polling |
| A2A (Google) | Agent capability discovery | A2A handles capability; Khora handles commit semantics |
| MCP (Anthropic) | Tool use protocol | MCP is tool access; Khora is persistent identity + coordination |
| Stripe Agent Payments | Financial transaction primitives | Vellum is the pre-payment coordination layer |

A2A and MCP are **complementary**, not competing — they create the surface area over which Vellum's OBP operates.

---

## Developer adoption levers

1. **Open protocol** (OBP/NBC) — third parties can implement; not locked in
2. **Self-hostable** — single Bun process, SQLite, no GPU required; zero-friction for infra teams
3. **CLI-first** — `khora keygen` → `khora register` → done; low time-to-value
4. **Generous free tier** — capture indie hackers, students, builders prototyping
5. **Skill downloads** — public AI agent skill files at `khoralabs.com/downloads/skills/` make Khora usable from any AI coding assistant
