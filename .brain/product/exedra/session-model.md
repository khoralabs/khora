# Session Data Model

## Interview Session (Belief-Surfacing Phase)

| Field | Description |
|---|---|
| `id` | Session ID |
| `teamId` | Owning team |
| `displayName` | Human-readable session name |
| `topic` | Short topic label |
| `prompt` | Seed prompt shown to all stakeholders as baseline |
| `deadline` | Optional deadline for completing interviews |
| `invites` | List of invited identities (see below) |
| `status` | `draft → active → synthesis → alignment → closed` |

## Contention Session (Alignment Phase)

| Field | Description |
|---|---|
| `sessionId` | Parent session reference |
| `attributionVisible` | Toggle: show/hide stakeholder attribution in contention report |
| `contentions` | Auto-detected + facilitator-curated list of contention items |
| `status` | `pending → open → closed` |

## Invite Identities

Invites can target any of:
- Email address (magic link, no account required)
- Khora DID (`did:key:…`) — native Khora network delivery via inbox
- Registry username — resolved to DID via registry catalog

This keeps the door open for Khora-native participants while remaining accessible to anyone via email.
