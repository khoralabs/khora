import { type NamespacePath, namespaceFromSegments } from "@khoralabs/memories-core";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";

import { encodePrincipalIdForMemories } from "./encode-principal-id.js";

const GLOBAL_ROOT = "_global_" as NamespacePath;

export function orgScope(orgId: string): NamespacePath {
  return namespaceFromSegments(["_global_", "org", orgId]);
}

export function orgTeamScope(orgId: string, teamId: string): NamespacePath {
  return namespaceFromSegments(["_global_", "org", orgId, "team", teamId]);
}

export function userScope(userId: string): NamespacePath {
  const encoded = encodePrincipalIdForMemories(userId);
  return namespaceFromSegments(["_global_", encoded]);
}

export function userTeamScope(userId: string, orgId: string, teamId: string): NamespacePath {
  const encoded = encodePrincipalIdForMemories(userId);
  return namespaceFromSegments(["_global_", encoded, "org", orgId, "team", teamId]);
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
