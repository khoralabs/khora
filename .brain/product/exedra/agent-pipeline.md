# Agent Pipeline

## 1. Interview Agent (real-time, per stakeholder)

Runs during the active interview WebSocket session.

**Responsibilities:**
- Holds full conversation history in context
- Retrieves relevant established facts from the team namespace at the start of each turn
- Asks follow-up questions based on stakeholder responses
- Uses **tool calls** to flag beliefs/observations inline as they emerge

When a participant interview thread is first created from a session grant, Exedra appends a hidden kickoff message (`metadata.kickoff = true`) before dispatching `generate-response`. The kickoff searches the organization namespace with the facilitator's session topic and injects the resulting memory context into the first model turn, so the agent can immediately ask an informed opening interview question without showing the seed prompt in the UI.

**Belief flagging tool:**
- When the agent identifies a belief worth capturing, it calls a tool that surfaces a **non-blocking confirmation card** in the UI — the conversation continues without waiting
- Each flagged belief carries a **provenance link** to the source message(s) in the transcript (by message index/ID)
- Stakeholder can confirm, correct, or dismiss at any point during or after the interview
- The outcome (confirmed / corrected / dismissed) + the source message reference is recorded as a feedback event on the interview record
- Corrections close a feedback loop: the agent's flagging model can learn from what the stakeholder accepted vs. rejected
- Confirmed and corrected beliefs are stored as **pending integration items** attached to the transcript (not yet in memories)

**Output:**
- Interview transcript (stored in `exedra.db`)
- List of confirmed belief items attached to the transcript

---

## 2. Memories Integration Agent (background, per completed interview)

Runs after the stakeholder completes and grants access. Uses the integrator pipeline from `@khoralabs/memories` (`packages/agents/integrator`).

**Trigger:** Stakeholder submits interview + grants namespace access

**Input:** Interview transcript + confirmed belief items

**Process:**
- LLM integrator decomposes transcript into structured memory drafts (`observation`/`belief` node kinds)
- Confirmed and corrected belief items are used as seeds/hints for the integrator, each carrying the source message reference
- The source message reference is preserved in the memory's `source` field (SPO fact) and in the memories provenance chain
- Memories are merged into the stakeholder's personal session namespace (`_global_/{userId}/org/{orgId}/team/{teamId}/session/{sessionId}`)

**Output:** Populated personal memories namespace, ready for contention detection

---

## 3. Synthesis Agent (background, per session)

Runs after the facilitator closes the interview phase.

**Trigger:** Facilitator closes interview phase (all or enough stakeholders complete)

**Process:**
1. Reads all granted stakeholder session namespaces
2. Runs semantic search + clustering across belief memories to detect divergence
3. Produces structured contention items with supporting memory references
4. Writes contention report to the shared session namespace

**Output:** Contention report, surfaced to the facilitator for review

---

## 4. Alignment Agent (real-time, passive, in group chat)

Runs during the alignment group chat phase.

**Responsibilities:**
- Listens to all group chat messages
- On each message, updates the speaker's belief memories in their personal namespace (background, non-blocking)
- Responds only when @mentioned
- On commit command: promotes agreed claim to `fact` in the shared team namespace

**Tool calls (on @mention):**
- Summarize a contention
- Show current diverging views on a topic
- Commit a resolution → `mergeMemory` with `fact` label kind into `_global_/org/{orgId}/team/{teamId}`

---

## Background Job Runner

All background agents (steps 2, 3, and belief updates in step 4) run as **in-process async jobs** on the Bun server — no separate worker process or queue required for v1. Jobs are tracked in `exedra.db` with status (`pending → running → done → failed`) so the facilitator UI can show progress.
