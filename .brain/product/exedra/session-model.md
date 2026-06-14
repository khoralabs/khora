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

## Invite Delivery

Facilitators send **deep links** (e.g. `https://exedra.example/invite/{token}`), not standalone magic-auth URLs.

Flow:
1. Invitee opens deep link → Exedra loads invite metadata (`GET /api/invites/{token}`)
2. If no registry session → same OTP sign-in flow as homepage (`EmailConfirm` + registry)
3. After auth → `POST /api/invites/{token}/accept` → redirect to session interview

Invite identities can still target email (pre-seeded in invite record), Khora DID, or registry username for future delivery channels.
