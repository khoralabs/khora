# Entity Model

## Org

Created by a user (the org owner). Container for teams and org-level ground truth.

| Field | Description |
|---|---|
| `id` | Org ID |
| `name` | Display name |
| `ownerId` | User who created the org |

## Team

Created by any org member. Persistent container for the shared knowledge base across sessions.

| Field | Description |
|---|---|
| `id` | Team ID |
| `orgId` | Parent org |
| `name` | Display name |
| `ownerId` | User who created the team (manages membership) |
| `memberIds` | Team members with read access to the shared knowledge base |

## Team Invite

Shareable link for adding colleagues to a team (distinct from session stakeholder invites).

| Field | Description |
|---|---|
| `token` | Single-use plaintext token (hashed in `team_invites.token_hash`) |
| `teamId` | Team the invite adds members to |
| `createdByUserId` | Team member who minted the link |
| `revokedAtMs` | Optional revocation timestamp |

## Session

Created by the facilitator. Scoped to a team. Moves through a defined lifecycle.

| Field | Description |
|---|---|
| `id` | Session ID |
| `teamId` | Parent team |
| `displayName` | Human-readable session name |
| `topic` | Short topic label |
| `prompt` | Seed prompt shown to all stakeholders |
| `deadline` | Optional response deadline |
| `facilitatorId` | Team member who created and runs this session |
| `invites` | Invited identities (email / DID / registry username) |
| `status` | `draft → active → synthesis → alignment → closed` |

Any team member can create and facilitate a session. Facilitation is not a fixed team role.

## Contention Session

Attached to a session when the facilitator opens the alignment phase.

| Field | Description |
|---|---|
| `sessionId` | Parent session |
| `attributionVisible` | Whether stakeholder names are shown in the contention report |
| `contentions` | List of contention items (auto-detected + manually added) |
| `status` | `pending → open → closed` |
