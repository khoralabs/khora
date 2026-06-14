# Contention Detection

## Process

After all interviews are synthesized, the system automatically identifies points of contention across stakeholder belief namespaces for the session.

## Detection Method

1. Semantic search across all stakeholder session namespaces (`_global_/{userId}/team/{teamId}/session/{sessionId}`)
2. Cluster overlapping claims by subject similarity
3. Flag clusters where stakeholders diverge on the `predicate` or `object` for the same (or semantically equivalent) subject
4. Score each contention by degree of divergence and number of stakeholders involved

## Facilitator Review

- The facilitator sees the auto-detected contentions before opening the alignment chat
- They can:
  - Accept, dismiss, or edit detected contentions
  - Manually add their own contention points not surfaced automatically
  - Reorder or prioritize which contentions the alignment session focuses on

## Output

A structured **contention report** for the session, used as the seed context for the alignment group chat.
Each contention item includes:
- The topic/subject
- Each stakeholder's position (attributed)
- The degree of divergence
- Relevant supporting quotes from interview transcripts
