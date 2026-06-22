# Exedra authorization reference

Canonical reference for grants, permissions, entitlements, and knowledge-graph access in Exedra.

Implementation lives in [`app/src/server/authz/`](../app/src/server/authz/). When adding grant features or checks, update this document in the same PR.

## Two storage mechanisms

| Mechanism | Table | Shape | Purpose |
|-----------|-------|-------|---------|
| **Grants** | `authz_grants` | `(scope_type, scope_id) → (resource_type, resource_id, feature)` | Membership, roles, and permission edges |
| **Entitlements** | `authz_entitlements` | `(scope_type, scope_id, feature)` | Feature flags scoped to org/account (no resource target) |

**Naming note:** The React [`EntitlementGate`](../app/src/client/components/authz/entitlement-gate.tsx) component checks **permission grants** (`OrgPermission` / `TeamPermission`), not rows in `authz_entitlements`.

## Concepts

- **Scope** — who holds the grant (`account`, `team`, `org`).
- **Resource** — what the grant applies to (`team`, `org`, `session`, `thread`, `account`).
- **Feature** — the capability string on the edge (`member`, `read`, `contributor`, …).
- **Direct grant** — `account` scope → resource (e.g. account → session participant).
- **Team-scoped grant** — `team` scope → resource; all team **members** inherit it (e.g. team → session participant).
- **Team-scoped permission** — permission granted at `teamScope(teamId)`; all team members receive it via [`hasTeamPermission`](../app/src/server/authz/policy.ts).

## Grant features (`Feature`)

| Feature | Typical scope → resource | Meaning | Gates |
|---------|--------------------------|---------|-------|
| `member` | account → team; team → org | Team membership; org membership via team | `team:member`, org membership |
| `admin` | account → org/team; account/team → session | Org/team admin; session facilitator | Org/team admin shortcuts; session management |
| `participant` | account → session; team → session | Session interview participant | Interview, session routes, WS (`hasSessionAccess`) |
| `facilitation` | account → session | Facilitation thread access (collaborator) | Shared facilitation chat (`hasFacilitationAccess`) |
| `read` | account → thread/session/account | Read-only access | Thread read; session KG read; shared personal KG read |
| `write` | account → thread | Thread write | Interview thread messages |
| `contributor` | account → team | KG contribute without team membership | Team knowledge graph contribute |

## Org permissions (`OrgPermission`)

Defined in [`shared/authz/permissions.ts`](../app/src/shared/authz/permissions.ts). Checked via `hasOrgPermission` / `enforce(..., "org:*")`.

| Permission | UI label | `enforce` action | Typical use |
|------------|----------|----------------|-------------|
| `read` | Organization read | `org:read` | View org settings/members; org-level document batch read |
| `write` | Organization write | `org:write` | Edit org settings |
| `permissions_manage` | Permissions management | `org:permissions_manage` | Manage org permission templates |
| `team_manage` | Team management | `org:team_manage` | Create/delete teams |
| `member_manage` | Member management | `org:member_manage` | Add/remove org members |
| `session_create` | Session creation | `org:session_create` | Create sessions in org teams (with team permission) |

Org admins (`Feature.Admin` on org) receive all org permissions. Any org member receives `read` by default.

## Team permissions (`TeamPermission`)

| Permission | UI label | `enforce` action | Typical use |
|------------|----------|----------------|-------------|
| `read` | Team read | `team:read` | View team settings; **team KG read** |
| `write` | Team write | `team:write` | Edit team settings |
| `member_manage` | Member management | `team:member_manage` | Add/remove team members |
| `session_create` | Session creation | `team:session_create` | Create new sessions in this team |

Team admins receive all team permissions. Team **members** receive `read` by default without an explicit grant.

Session creation requires **both** org and team `session_create` permission (via [`canCreateSession`](../app/src/server/authz/policy.ts)). New teams bootstrap team-scoped `session_create` grants for all members.

## Session grant patterns

| Helper | Team-inherited? | Used for |
|--------|-----------------|----------|
| `hasSessionAccess` | Yes | Interview, session detail, WebSocket |
| `hasFacilitationAccess` | Admin + facilitation (team-inherited for both) | Facilitation thread bootstrap and WS |
| `canManageSession` / `isSessionFacilitator` | Admin only | Session management, sharing |
| `canReadSessionKg` | **No** (direct account grants only) | Session knowledge graph read |
| `canContributeToSessionKg` | **No** (direct participant or admin) | KG contribute, session document upload |

### Session features (direct account grants)

| Feature | KG read | KG contribute | Interview access |
|---------|---------|---------------|------------------|
| `read` | Yes | No | No (unless also participant) |
| `participant` | Yes | Yes | Yes |
| `admin` | Yes | Yes | Yes (facilitator) |
| `facilitation` | No | No | Facilitation thread only (via `hasFacilitationAccess`) |

Team-scoped session grants (`team` → session) still expand to all team members for **interview** access, but **not** for KG read/contribute checks.

## Thread grants

- `grantThreadAccess(account, thread)` — grants `read` + `write` on thread resource.
- `canReadThread` — explicit thread read/write grant or session facilitator.

## Personal knowledge graph

| Action | Rule |
|--------|------|
| Read | Owner, or account-scoped `read` grant on owner account (`grantPersonalKgReader`) |
| Contribute | Owner only |

Shared readers use `/api/memories/users/:ownerId/*`. Owners use `/api/memories/me/*`.

### Session interview personal memory access

When a participant joins a session via invite and consents, Exedra grants the **organization** read access to the participant's personal knowledge graph:

- **Grant:** `grantPersonalKgReader(orgId, participantUserId)` — org agent identity as reader, participant as owner.
- **Consent record:** `session_participants.personal_memory_consent_at_ms` for audit and ref-counting.
- **Search scope:** interview retrieval searches **`userSessionScope` only** (not the full personal KG root), even though the grant is account-scoped.
- **Revoke:** on session interview completion or participant removal, clear consent for that session; call `revokePersonalKgReader(orgId, userId)` only when no other session still has active consent for the same org–user pair.

See [`personal-memory-access.ts`](../app/src/server/memories/personal-memory-access.ts) and [`session-participants.ts`](../app/src/server/db/session-participants.ts).

## Knowledge graph namespace access

| Scope | Contribute | Read |
|-------|------------|------|
| **Personal** | Owner only | Owner or personal `read` grant |
| **Team** | Team member or `contributor` grant | `team:read` |
| **Session** | Direct `participant` or `admin` | Direct `read`, `participant`, or `admin` |

Enforced in [`memories/access.ts`](../app/src/server/memories/access.ts), [`documents/grant-scope.ts`](../app/src/server/documents/grant-scope.ts), and memories API routes.

Org DB namespaces: `org/{encodedOrgId}/team/{teamId}` and `org/{encodedOrgId}/team/{teamId}/session/{sessionId}`.

## Policy actions (`AuthAction`)

Resolved by [`enforce()`](../app/src/server/authz/policy.ts):

| Action | Meaning |
|--------|---------|
| `team:member` | Account has `member` grant on team |
| `team:read` / `team:write` / `team:member_manage` | Team permission checks |
| `org:member` | Member of any team in org |
| `org:read` / `org:write` / … | Org permission checks |
| `org:session_create` / `team:session_create` | Session creation permission checks |
| `session:view` | `hasSessionAccess` (broad, includes inheritance) |
| `thread:read` | `canReadThread` |

## Entitlements (`authz_entitlements`)

| Feature | Status |
|---------|--------|
| `create_session` | **Superseded** by `OrgPermission.SessionCreate` / `TeamPermission.SessionCreate` |
| `knowledge_graph` | **Deferred** — not enforced |

Applied via invite effects ([`invites/apply-effects.ts`](../app/src/server/invites/apply-effects.ts)).

## Invite effect templates

| Helper | Grants applied |
|--------|----------------|
| `teamMemberInviteEffects(teamId)` | account → team `member` |
| `sessionParticipantOnlyInviteEffects(sessionId)` | account → session `participant` |
| `sessionParticipantInviteEffects(sessionId, teamId)` | session `participant` + team `member` |
| `sessionReaderInviteEffects(sessionId)` | account → session `read` |
| `teamContributorInviteEffects(teamId)` | account → team `contributor` |

## Bootstrap defaults

| Event | Grants created |
|-------|----------------|
| Org creation | `grantAllOrgPermissions` + org `admin` for creator |
| Team creation | `grantAllTeamPermissions` + team `member` + `admin` for creator; team-scoped `session_create` (org + team); `grantTeamOrgMembership` |
| Session creation | `grantSessionCreatorAccess` — session `admin` + `participant` for creator |
| Interview thread | `grantThreadAccess` — thread `read` + `write` |
| Team session share | Optional `grantTeamSessionParticipant` / `grantTeamSessionAdmin` |

## Grant helper functions

See [`policy.ts`](../app/src/server/authz/policy.ts) exports: `grantTeamMember`, `grantSessionParticipant`, `grantSessionReader`, `grantTeamContributor`, `grantPersonalKgReader`, and matching `revoke*` helpers.
