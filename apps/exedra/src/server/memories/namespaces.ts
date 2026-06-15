import { type NamespacePath, namespaceFromSegments } from "@khoralabs/memories-core";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";

import { encodePrincipalIdForMemories } from "./encode-principal-id.js";

const GLOBAL_ROOT = "_global_" as NamespacePath;

/** Org namespace under company: org/{orgId} */
export function orgScope(orgId: string): NamespacePath {
  return namespaceFromSegments(["org", orgId]);
}

/** Team namespace under org: org/{orgId}/team/{teamId} */
export function orgTeamScope(orgId: string, teamId: string): NamespacePath {
  return namespaceFromSegments(["org", orgId, "team", teamId]);
}

/** Session namespace under team: org/{orgId}/team/{teamId}/session/{sessionId} */
export function orgSessionScope(orgId: string, teamId: string, sessionId: string): NamespacePath {
  return namespaceFromSegments(["org", orgId, "team", teamId, "session", sessionId]);
}

/** User global namespace: {userId} */
export function userScope(userId: string): NamespacePath {
  const encoded = encodePrincipalIdForMemories(userId);
  return namespaceFromSegments([encoded]);
}

/** User team namespace: {userId}/org/{orgId}/team/{teamId} */
export function userTeamScope(userId: string, orgId: string, teamId: string): NamespacePath {
  const encoded = encodePrincipalIdForMemories(userId);
  return namespaceFromSegments([encoded, "org", orgId, "team", teamId]);
}

/**
 * User session namespace: {userId}/org/{orgId}/team/{teamId}/{sessionId}
 * Session id is the leaf segment (memories max depth 6; no room for a literal `session` segment).
 */
export function userSessionScope(
  userId: string,
  orgId: string,
  teamId: string,
  sessionId: string,
): NamespacePath {
  const encoded = encodePrincipalIdForMemories(userId);
  return namespaceFromSegments([encoded, "org", orgId, "team", teamId, sessionId]);
}

export function ensureScopeChain(
  persistence: MemoriesPersistence,
  scopePaths: readonly NamespacePath[],
): void {
  if (scopePaths.length === 0) return;
  const op = { now: Date.now() };
  persistence.withTransaction(() => {
    persistence.upsertScope(op, { scopeId: scopePaths[0] ?? GLOBAL_ROOT });
    for (let i = 0; i < scopePaths.length - 1; i++) {
      const parent = scopePaths[i];
      const child = scopePaths[i + 1];
      if (parent === undefined || child === undefined) continue;
      persistence.linkScopes(op, { parentScopeId: parent, childScopeId: child });
    }
  });
}

export function ensureOrgTeamScopes(
  persistence: MemoriesPersistence,
  orgId: string,
  teamId: string,
): void {
  ensureScopeChain(persistence, [GLOBAL_ROOT, orgScope(orgId), orgTeamScope(orgId, teamId)]);
}

export function ensureOrgSessionScopes(
  persistence: MemoriesPersistence,
  orgId: string,
  teamId: string,
  sessionId: string,
): void {
  ensureScopeChain(persistence, [
    GLOBAL_ROOT,
    orgScope(orgId),
    orgTeamScope(orgId, teamId),
    orgSessionScope(orgId, teamId, sessionId),
  ]);
}

export function ensureUserTeamScopes(
  persistence: MemoriesPersistence,
  userId: string,
  orgId: string,
  teamId: string,
): void {
  ensureScopeChain(persistence, [
    GLOBAL_ROOT,
    userScope(userId),
    userTeamScope(userId, orgId, teamId),
  ]);
}

export function ensureUserSessionScopes(
  persistence: MemoriesPersistence,
  userId: string,
  orgId: string,
  teamId: string,
  sessionId: string,
): void {
  ensureScopeChain(persistence, [
    GLOBAL_ROOT,
    userScope(userId),
    userTeamScope(userId, orgId, teamId),
    userSessionScope(userId, orgId, teamId, sessionId),
  ]);
}
