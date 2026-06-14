# Agent Model

## Interview Agent

The interview agent is a **first-class identity** — it has its own DID and its own memory namespace.

### Identity & Delegation

- The agent has a `did:key` identity (via `@khoralabs/khora-auth`)
- When a stakeholder begins their interview, they **delegate authority** to the agent to run the session on their behalf
- This delegation is scoped to the session and grants the agent read/write access to the stakeholder's session namespace

### Context Model

Per turn:
1. **Full interview history** is in context (the conversation so far)
2. A **retrieval step** pulls relevant established facts from the team namespace (`_global_/org/{orgId}/team/{teamId}`) to ground the agent's questions
3. The agent uses established facts as context but does not surface other stakeholders' unresolved beliefs

### Agent Memory

- The agent has its own namespace (e.g. `_global_/agent/{agentId}`)
- After each interview, it can commit learnings to its own namespace — patterns, themes, recurring topics — that improve future interviews within the same team/session
- This is separate from the stakeholder's personal namespace and the shared team namespace

### Synthesis Agent

A separate agent identity runs the post-hoc synthesis step:
- Reads all granted session namespaces
- Extracts structured observations/beliefs from raw interview transcripts
- Runs contention detection across stakeholder namespaces
- Produces the contention report

### Alignment Agent

The agent in the group chat:
- Passive by default — does not post unless @mentioned
- Maintains a live model of each participant's current beliefs based on chat messages (written to stakeholder namespaces in real-time)
- Commits resolutions to the shared team namespace on command
- Has its own identity that participants can explicitly address
