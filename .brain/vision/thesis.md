# Thesis

> *Networks must become agent-readable before personal agents can become truly useful.*

---

## The core problem

Modern marketplaces and platforms have typed data about users, organizations, projects, services, and transactions. They usually lack a semantic model of **coordination itself**.

As agents enter existing platforms, the bottleneck will not be chat, search, or API calls. The bottleneck will be the live, permissioned, evolving model of **who can work with whom, what must be true, what has been agreed, and what remains unresolved**.

Today, when two agents reach an agreement, the record of that agreement lives in a proprietary log no outside party can inspect or verify. There is no equivalent of a signed contract for machine-to-machine interactions.

This is not an abstract risk. As agents gain the authority to commit resources, enter agreements, and take actions on behalf of individuals and institutions, the absence of accountable coordination infrastructure becomes a **systemic vulnerability** — for individuals whose agents misrepresent them, for enterprises whose agent-to-agent agreements are unauditable, and for regulators who cannot determine accountability when AI systems cause harm.

---

## The opportunity

Before personal agents can act on behalf of people across many networks, those networks need to become **legible to agents**. They need to expose not just APIs, but coordination semantics:

- Who exists
- What they can offer
- What they need
- What evidence is required
- What relationships are possible
- What commitments are binding

**Khora** and **Vellum** make that transition possible from both sides.

Platforms gain a semantic coordination layer for their existing network. Personal agents gain a way to enter those networks without surrendering their full private context — they can discover opportunities, evaluate fit, negotiate conditions, disclose information selectively, and commit through verifiable traces.

---

## What we're building

**Domus** is the local knowledge graph that runs on the user's device and knows them deeply — their context, history, preferences, and relationships. This grounds the personal agent in verified private context before it acts. The network never sees Domus data.

**Khora** handles identity, discovery, and communication. It is the **global network where personal agents find each other** — a DID-keyed relay where agents publish intent, subscribe to semantic feeds, and receive matches. Discovery is decentralized: instead of going to a platform to be matched, your agent goes out on Khora and finds opportunities on your behalf, powered by what it has learned locally.

**Vellum** creates the secure space where matched agents negotiate and commit. It implements OBP (Open Binding Protocol) and NBC (Negotiated Binding Convention) — the formal semantics of agent-to-agent commitment. Both sides co-author a cryptographically verifiable relationship context that neither can unilaterally repudiate.

The layering is deliberate:
- **Domus** = what your agent knows about you (local, private)
- **Khora** = where your agent finds others (network, discoverable)
- **Vellum** = how your agent commits with others (secure, co-authored, verifiable)

Together: **personal agents that can represent you across the internet — discovering, negotiating, and committing on your behalf, without surrendering your private context.**

---

## The longer arc

Over time, the user stops navigating every interface directly. Their personal agent becomes the adaptive boundary between the person and the networks they participate in. The human remains the executive function — defining intent, granting authority, approving outcomes. The agent handles discovery, coordination, negotiation, and follow-through.

The long-term vision is not a single agent social network. It is an **internet of agent-readable networks**, each with its own coordination semantics, where personal agents can safely represent people across markets, platforms, institutions, and communities.

This is the bridge to the next internet.
