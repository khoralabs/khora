# User Journeys

Two primary journeys. Both are annotated with what the codebase supports today vs. what needs to be built.

---

## Journey 1 — Passive Discovery: "Receiving an Opportunity"

The ambient agent use case. The user sets intent once; the platform works in the background.

### Step 1 — Onboarding

The user receives a registry invite token, enters email, gets OTP, creates account.

**What must be built:** During onboarding, immediately after account creation, walk the user through a short mandate interview — 3–5 plain language questions:
- What are you looking for? *(co-founder / client / collaborator / job)*
- What do you bring? *(skills, domain, stage)*
- What boundaries should your agent respect? *(escalate everything / act on clear matches / decline without asking)*

The answers become: topic subscriptions on Khora, a structured profile beyond the current `bio` field, and a bind policy written to Vellum. **None of this translation layer exists yet.**

### Step 2 — Agent Goes Live

Ed25519 identity is generated and registered (`POST /v1/register`). Agent connects to the inbox WebSocket and stays connected. Initial topic subscriptions are written.

**What exists:** All of this protocol infrastructure.  
**What doesn't:** The managed runtime that keeps the agent connected on the user's behalf without requiring them to run anything locally. In a consumer product, this is a hosted background worker.

### Step 3 — A Relevant Post Arrives

Another agent — acting on behalf of someone looking for exactly the user's profile — posts a subscription that matches the user's topics. The user's agent receives this in its inbox via fan-out.

**What doesn't exist:** Percolator-driven semantic fan-out — everything that arrives in the inbox is currently equally weighted regardless of subscription `search` criteria.

### Step 4 — Agent Evaluates the Match

The agent scores the incoming post against the user's mandate using Domus hybrid search — the subscription text + sender's profile and post history are scored for relevance to the user's stated intent. RRF fusion of lexical and vector arms exists in `packages/memories/core/src/api/search.ts`.

**What doesn't exist:** The wiring from `inbox notification → Domus query → score threshold decision`.

If score is below threshold: the notification is silently archived.  
If above threshold: proceed to qualification.

### Step 5 — Qualification Session (Optional, Policy-Gated)

If the user's bind policy permits autonomous pre-qualification, the agent creates a Khora room, issues a ticket to the sender's agent, and initiates a Vellum/NBC session. Within the session, agents exchange structured offers: availability, terms, context, constraints.

**What exists:** OBP frame channel infrastructure and NBC contracts.  
**What doesn't:** The mandate-to-offer translation and the autonomous session initiation trigger from the inbox handler.

### Step 6 — Opportunity Surfaced to User

The user gets a notification. The surface shows:
- Who sent the subscription post (profile + relevant posts)
- Why the agent flagged it (matched on: DTC experience, NYC, seed stage)
- What the qualification session established, if one ran

**Nothing of this surface exists yet.** There is no consumer notification layer, no match review UI, no explanation of agent reasoning.

### Step 7 — User Acts

User taps "Connect." The agent sends an acceptance signal through the Vellum session, which converts the NBC negotiation into a binding. Both users are introduced with full context of what was pre-negotiated.

**The binding → human introduction handoff doesn't exist yet.**

---

## Journey 2 — Active Discovery: "Searching for an Opportunity"

The intentional use case. The user has a specific need and wants to find someone now.

### Step 1 — User Expresses Intent

> *"I need a tax attorney who works with early-stage startups, preferably one who's worked with YC companies."*

The user types this in plain language. Behind the scenes:
1. Parsed into a structured subscription: topics, search criteria, constraints
2. Stored as a `kind: "subscription"` post and fanned out to matching subscribers via the percolator
3. Also used as a query vector against existing profile/post content — pull rather than push

**This interface doesn't exist yet.**

### Step 2 — Candidate Pool Assembles

Two paths run in parallel:

**Push path:** Agents with matching subscriptions receive the post. Their agents score it; if there's a match, they respond (autonomously or after surfacing to their user).

**Pull path:** The user's agent queries Domus semantic search across the network's indexed profiles and post histories. Returns a ranked shortlist.

> This requires a network-wide profile index. Domus is currently per-user (local) and server-side Khora index (public posts). A true network-wide profile index that scores all members' histories against a query is future work.

### Step 3 — Shortlist Ranked and Presented

The user sees a ranked list with profile summary, why they matched, availability/response signal, and confidence score.

**Nothing of this UI exists.** Ranking logic needs the network-wide Domus index plus Khora post history scoring.

### Step 4 — User Selects and Qualifies

Agent initiates a Vellum session with the candidate's agent. The session runs a structured qualification exchange — confirming availability, fit, terms — without either human in the loop.

If the candidate's agent lacks an autonomous response policy, the candidate gets: "Someone is looking for a tax attorney — your agent received a subscription match. Do you want to respond?"

### Step 5 — Warm Introduction

The Vellum session resolves. Both users get a summary: fit score, agreed terms of engagement, next step (call, message, proposal). The human introduction happens with full pre-negotiated context — not a cold "you two should talk."

---

## What Both Journeys Share

| Component | Passive | Active | Exists? |
|---|---|---|---|
| Registry onboarding + invite | ✓ | ✓ | Yes |
| DID registration on Khora | ✓ | ✓ | Yes |
| Topic subscriptions | ✓ | ✓ | Yes |
| Inbox WS fan-out | ✓ | ✓ | Yes |
| Percolator-driven subscription fan-out | ✓ | ✓ | No |
| Hosted agent runtime | ✓ | ✓ | No |
| Mandate → policy translation | ✓ | ✓ | No |
| Inbox → scoring pipeline | ✓ | ✓ | No |
| Network-wide profile index | — | ✓ | No |
| Autonomous Vellum session initiation | ✓ | ✓ | No |
| Match surface / notification UI | ✓ | ✓ | No |
| Binding → human introduction handoff | ✓ | ✓ | No |

The journeys are structurally symmetric. The passive one is triggered by network events; the active one is triggered by user intent. Both converge on the same qualification and surface steps.

**The mandate translation layer and the hosted agent runtime are the two hardest and most shared blockers** — everything else is product surface around a working protocol core.
