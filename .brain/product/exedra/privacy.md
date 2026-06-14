# Privacy & Access Control

## Core Principle

Individuals must be able to trust that sharing their honest beliefs won't be used against them. The system surfaces patterns, not raw interview content.

## Access Model

| Namespace | Readable by |
|---|---|
| `_global_/{userId}/...` | That user only |
| `_global_/team/{teamId}/session/{sessionId}` | Alignment participants + facilitator (contention report, committed facts) |
| `_global_/team/{teamId}` | All team members (ground truth facts only) |

## What the Facilitator Can See

- Session status (who has completed their interview, who hasn't)
- Auto-detected contention points (synthesized — not raw quotes)
- The alignment chat thread
- Committed facts in the shared namespace

## What the Facilitator Cannot See

- Raw interview transcripts
- Individual stakeholder belief memories in their personal namespace
- Which specific stakeholder holds which belief (before attribution is surfaced in the contention report, if attribution is enabled)

## Contention Report Attribution

- **Attribution off (default):** Contention items show diverging positions without naming who holds each view
- **Attribution on (facilitator toggle):** Positions are attributed to specific participants in the contention report

Even with attribution on, this only applies to the contention report — raw interview content remains private.

## Agent Authorization

The contention detection agent does not have a privileged backdoor to personal namespaces.

- When a stakeholder **completes their interview**, they are presented with an explicit grant: read access to their session-scoped namespace (`_global_/{userId}/team/{teamId}/session/{sessionId}`) for contention detection purposes only
- This grant is scoped, revocable, and auditable
- The agent acts as a **privacy-preserving intermediary** — it synthesizes divergence without exposing source material to any human participant
- A stakeholder who declines the grant can still complete their interview; their views simply won't be included in contention detection
