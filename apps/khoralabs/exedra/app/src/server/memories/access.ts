import type { Database } from "bun:sqlite";

import { listTeamIdsForOrg } from "../authz/grants.js";
import {
  canContributeToSessionKg,
  canContributeToTeamKg,
  canReadPersonalKg,
  canReadSessionKg,
  enforce,
  ResourceType,
} from "../authz/policy.js";
import { encodePrincipalIdForMemories } from "./encode-principal-id.js";
import { type NamespacePath, orgSessionScope, orgTeamScope, userScope } from "./namespaces.js";

export type PersonalNamespaceScope = {
  kind: "personal";
  ownerId: string;
};

export type TeamNamespaceScope = {
  kind: "team";
  orgId: string;
  teamId: string;
};

export type SessionNamespaceScope = {
  kind: "session";
  orgId: string;
  teamId: string;
  sessionId: string;
};

export type NamespaceScope = PersonalNamespaceScope | TeamNamespaceScope | SessionNamespaceScope;

export function parseNamespaceScope(
  namespace: string,
  context: { orgId?: string; userId?: string } = {},
): NamespaceScope | null {
  const segments = namespace.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  if (segments[0] === "org") {
    const encodedOrg = segments[1];
    const teamLiteral = segments[2];
    const teamId = segments[3];
    if (encodedOrg === undefined || teamLiteral !== "team" || teamId === undefined) {
      return null;
    }
    if (context.orgId !== undefined && encodePrincipalIdForMemories(context.orgId) !== encodedOrg) {
      return null;
    }
    const orgId = context.orgId;
    if (orgId === undefined) return null;

    if (segments[4] === "session" && segments[5] !== undefined) {
      return { kind: "session", orgId, teamId, sessionId: segments[5] };
    }
    if (segments.length === 4) {
      return { kind: "team", orgId, teamId };
    }
    return null;
  }

  const encodedUser = segments[0];
  if (context.userId === undefined) return null;
  if (encodePrincipalIdForMemories(context.userId) !== encodedUser) return null;
  return { kind: "personal", ownerId: context.userId };
}

export function assertNamespaceMatchesOrg(namespace: string, orgId: string): boolean {
  const segments = namespace.split("/").filter((segment) => segment.length > 0);
  if (segments[0] !== "org" || segments[1] === undefined) return false;
  return segments[1] === encodePrincipalIdForMemories(orgId);
}

function namespaceMatchesSessionGrant(
  targetNamespace: string,
  sessionId: string,
  userId?: string,
): boolean {
  const segments = targetNamespace.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 2 || segments[segments.length - 1] !== sessionId) return false;
  if (segments[0] === "org" && segments[4] === "session") return true;
  if (userId !== undefined && segments[0] === encodePrincipalIdForMemories(userId)) {
    return segments.length >= 5;
  }
  return false;
}

export function namespaceMatchesGrantResource(
  targetNamespace: string,
  grantResource: { type: string; id: string },
  context: { orgId?: string; userId?: string },
): boolean {
  if (grantResource.type === "session") {
    return namespaceMatchesSessionGrant(targetNamespace, grantResource.id, context.userId);
  }

  const scope = parseNamespaceScope(targetNamespace, {
    orgId: context.orgId,
    userId: context.userId,
  });
  if (scope === null) return false;

  switch (grantResource.type) {
    case "account":
      return scope.kind === "personal" && scope.ownerId === grantResource.id;
    case "team":
      return scope.kind === "team" && scope.teamId === grantResource.id;
    case "org":
      return scope.kind === "team" && scope.orgId === grantResource.id;
    default:
      return false;
  }
}

export function canReadNamespace(db: Database, userId: string, scope: NamespaceScope): boolean {
  switch (scope.kind) {
    case "personal":
      return canReadPersonalKg(db, userId, scope.ownerId);
    case "team":
      return enforce(db, userId, "team:read", { type: ResourceType.Team, id: scope.teamId });
    case "session":
      return canReadSessionKg(db, userId, scope.sessionId);
  }
}

export function canContributeToNamespace(
  db: Database,
  userId: string,
  scope: NamespaceScope,
): boolean {
  switch (scope.kind) {
    case "personal":
      return scope.ownerId === userId;
    case "team":
      return canContributeToTeamKg(db, userId, scope.teamId);
    case "session":
      return canContributeToSessionKg(db, userId, scope.sessionId);
  }
}

export function namespaceForScope(scope: NamespaceScope): NamespacePath {
  switch (scope.kind) {
    case "personal":
      return userScope(scope.ownerId);
    case "team":
      return orgTeamScope(scope.orgId, scope.teamId);
    case "session":
      return orgSessionScope(scope.orgId, scope.teamId, scope.sessionId);
  }
}

export function listReadableOrgNamespaces(db: Database, userId: string, orgId: string): string[] {
  const namespaces = new Set<string>();
  for (const teamId of listTeamIdsForOrg(db, orgId)) {
    if (enforce(db, userId, "team:read", { type: ResourceType.Team, id: teamId })) {
      namespaces.add(orgTeamScope(orgId, teamId));
    }

    const sessions = db
      .query<{ id: string }, [string]>(`SELECT id FROM sessions WHERE team_id = ?`)
      .all(teamId);
    for (const session of sessions) {
      if (canReadSessionKg(db, userId, session.id)) {
        namespaces.add(orgSessionScope(orgId, teamId, session.id));
      }
    }
  }

  const directSessions = db
    .query<{ session_id: string; team_id: string }, [string]>(
      `SELECT g.resource_id AS session_id, s.team_id
       FROM authz_grants g
       INNER JOIN sessions s ON s.id = g.resource_id
       INNER JOIN teams t ON t.id = s.team_id
       WHERE g.scope_type = 'account'
         AND g.scope_id = ?
         AND g.resource_type = 'session'
         AND g.feature IN ('read', 'participant', 'admin')
         AND g.revoked_at_ms IS NULL
         AND t.org_id = ?`,
    )
    .all(userId, orgId);
  for (const row of directSessions) {
    if (canReadSessionKg(db, userId, row.session_id)) {
      namespaces.add(orgSessionScope(orgId, row.team_id, row.session_id));
    }
  }

  return [...namespaces];
}

export function listReadablePersonalNamespaces(db: Database, userId: string): string[] {
  const namespaces: string[] = [];
  if (canReadPersonalKg(db, userId, userId)) {
    namespaces.push(userScope(userId));
  }
  return namespaces;
}

export function authorizeOrgNamespaceRead(
  db: Database,
  userId: string,
  orgId: string,
  namespace: string,
): boolean {
  if (!assertNamespaceMatchesOrg(namespace, orgId)) return false;
  const scope = parseNamespaceScope(namespace, { orgId });
  if (scope === null) return false;
  return canReadNamespace(db, userId, scope);
}

export function authorizePersonalNamespaceRead(
  db: Database,
  userId: string,
  namespace: string,
  ownerId: string,
): boolean {
  const encodedOwner = encodePrincipalIdForMemories(ownerId);
  const segments = namespace.split("/").filter((segment) => segment.length > 0);
  if (segments[0] !== encodedOwner) return false;
  return canReadPersonalKg(db, userId, ownerId);
}
