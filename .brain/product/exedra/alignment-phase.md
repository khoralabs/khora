# Alignment Phase

## Format

An **async group chat thread** — like a Slack channel with an agent silently recording. Stakeholders contribute on their own schedule; the thread stays open until the facilitator closes the alignment phase. No synchronous attendance required.

## Agent Behavior

- The agent is a **passive participant** — it does not proactively interject or moderate
- Any participant can **@mention the agent** to invoke it
- On command, the agent can:
  - Summarize current state of a contention
  - Show diverging views on a topic
  - **Commit a resolution** — promotes an agreed claim to `fact` in the shared knowledge base
  - Update its model of an individual's beliefs based on what they've said in chat

## Belief Tracking

- As participants converse, the agent continuously updates its internal model of each person's beliefs (`observation`/`belief` kind memories, scoped per stakeholder)
- This happens silently in the background — the agent doesn't narrate its updates unless asked
- New beliefs from the alignment chat are **merged into each stakeholder's personal namespace** — old interview beliefs are not reprocessed
- Where a new belief supersedes an old one, a typed graph edge links them (e.g. a `supersedes` edge kind with the alignment chat as source)
- When a resolution is committed, the resolved `fact` lands in the shared namespace; each stakeholder's personal namespace retains their belief history with provenance intact

## Resolution Commitment

- A resolution is explicitly triggered (e.g. `@agent commit: X is true`)
- The agent records the resolution as a `fact` in the shared namespace
- It notes which stakeholders were party to the resolution and any dissenting views
- Provenance is preserved — the alignment chat transcript is the source

## Attribution Policy

- During alignment, views are **attributed** (not anonymized) — stakeholders are in the room and know who said what
- Attribution is recorded in fact provenance for future auditability
