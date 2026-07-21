import type { Database } from "bun:sqlite";
import type { NamespacePath } from "@khoralabs/memories-node";

import {
  accountScope,
  canContributeToSessionKg,
  canContributeToTeamKg,
  canReadPersonalKg,
  canReadSessionKg,
  enforce,
  listTeamIdsForOrg,
  ResourceType,
} from "../authz/policy.js";
import { requireAuthzServiceClient } from "../authz/service-client.js";
import { encodePrincipalIdForMemories } from "./encode-principal-id.js";
import { orgSessionScope, orgTeamScope, userScope } from "./namespaces.js";

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

export async function canReadNamespace(
  _db: Database,
  userId: string,
  scope: NamespaceScope,
): Promise<boolean> {
  switch (scope.kind) {
    case "personal":
      return await canReadPersonalKg(userId, scope.ownerId);
    case "team":
      return await enforce(userId, "team:read", { type: ResourceType.Team, id: scope.teamId });
    case "session":
      return await canReadSessionKg(userId, scope.sessionId);
  }
}

export async function canContributeToNamespace(
  _db: Database,
  userId: string,
  scope: NamespaceScope,
): Promise<boolean> {
  switch (scope.kind) {
    case "personal":
      return scope.ownerId === userId;
    case "team":
      return await canContributeToTeamKg(userId, scope.teamId);
    case "session":
      return await canContributeToSessionKg(userId, scope.sessionId);
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

export async function listReadableOrgNamespaces(
  db: Database,
  userId: string,
  orgId: string,
): Promise<string[]> {
  const namespaces = new Set<string>();
  for (const teamId of await listTeamIdsForOrg(orgId)) {
    if (await enforce(userId, "team:read", { type: ResourceType.Team, id: teamId })) {
      namespaces.add(orgTeamScope(orgId, teamId));
    }

    const sessions = db
      .query<{ id: string }, [string]>(`SELECT id FROM sessions WHERE team_id = ?`)
      .all(teamId);
    for (const session of sessions) {
      if (await canReadSessionKg(userId, session.id)) {
        namespaces.add(orgSessionScope(orgId, teamId, session.id));
      }
    }
  }

  const client = requireAuthzServiceClient();
  const { grants } = await client.listGrantsForScope({ scope: accountScope(userId) });
  const orgTeamIds = new Set(await listTeamIdsForOrg(orgId));
  for (const grant of grants) {
    if (grant.resourceType !== ResourceType.Session) continue;
    if (!["read", "participant", "admin"].includes(grant.feature)) continue;
    const sessionRow = db
      .query<{ team_id: string }, [string]>(`SELECT team_id FROM sessions WHERE id = ? LIMIT 1`)
      .get(grant.resourceId);
    if (sessionRow === null || !orgTeamIds.has(sessionRow.team_id)) continue;
    if (await canReadSessionKg(userId, grant.resourceId)) {
      namespaces.add(orgSessionScope(orgId, sessionRow.team_id, grant.resourceId));
    }
  }

  return [...namespaces];
}

export async function listReadablePersonalNamespaces(
  _db: Database,
  userId: string,
): Promise<string[]> {
  const namespaces: string[] = [];
  if (await canReadPersonalKg(userId, userId)) {
    namespaces.push(userScope(userId));
  }
  return namespaces;
}

export async function authorizeOrgNamespaceRead(
  db: Database,
  userId: string,
  orgId: string,
  namespace: string,
): Promise<boolean> {
  if (!assertNamespaceMatchesOrg(namespace, orgId)) return false;
  const scope = parseNamespaceScope(namespace, { orgId });
  if (scope === null) return false;
  return await canReadNamespace(db, userId, scope);
}

export async function authorizePersonalNamespaceRead(
  _db: Database,
  userId: string,
  namespace: string,
  ownerId: string,
): Promise<boolean> {
  const encodedOwner = encodePrincipalIdForMemories(ownerId);
  const segments = namespace.split("/").filter((segment) => segment.length > 0);
  if (segments[0] !== encodedOwner) return false;
  return await canReadPersonalKg(userId, ownerId);
}
