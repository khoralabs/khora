# Session Close & Summary

## Trigger

The facilitator manually closes the alignment phase. The system then auto-generates a session summary.

## Session Summary Contents

| Section | Contents |
|---|---|
| **Newly committed facts** | All `fact` memories promoted to the team namespace during this session |
| **Resolved contentions** | Contention items that reached agreement, with the agreed position |
| **Open contentions** | Items that were not resolved, flagged for a future session |
| **Knowledge base diff** | Before/after view of what changed in `_global_/team/{teamId}` |

## Distribution

- The facilitator receives the summary immediately on close
- The facilitator can **publish** the summary to the full team
- Open contentions are preserved as first-class items that can seed a follow-on session

## Open Contention Carry-Forward

Unresolved contentions are stored in the session namespace and can be imported as pre-seeded contention items when the facilitator creates a new session on the same topic.
