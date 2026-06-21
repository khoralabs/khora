import {
  ensureOrgSessionScopes,
  ensureOrgTeamScopes,
  ensureUserSessionScopes,
  ensureUserTeamScopes,
} from "./namespaces.js";
import { resolveOrgMemoriesDbPath, resolveUserMemoriesDbPath } from "./paths.js";
import { openOrgMemories, openUserMemories } from "./store.js";

export type BootstrapOrgTeamMemoriesParams = {
  orgId: string;
  teamId: string;
  userId: string;
};

export type BootstrapSessionMemoriesParams = {
  orgId: string;
  teamId: string;
  sessionId: string;
  userIds: readonly string[];
};

export function bootstrapOrgTeamMemories(params: BootstrapOrgTeamMemoriesParams): {
  orgDbPath: string;
  userDbPath: string;
} {
  const { orgId, teamId, userId } = params;
  const orgPersistence = openOrgMemories(orgId);
  const userPersistence = openUserMemories(userId);

  ensureOrgTeamScopes(orgPersistence, orgId, teamId);
  ensureUserTeamScopes(userPersistence, userId, orgId, teamId);

  return {
    orgDbPath: resolveOrgMemoriesDbPath(orgId),
    userDbPath: resolveUserMemoriesDbPath(userId),
  };
}

/** Ensure org + user session namespaces under the team hierarchy. Idempotent. */
export function bootstrapSessionMemories(params: BootstrapSessionMemoriesParams): void {
  const { orgId, teamId, sessionId, userIds } = params;
  const orgPersistence = openOrgMemories(orgId);
  ensureOrgSessionScopes(orgPersistence, orgId, teamId, sessionId);

  const seen = new Set<string>();
  for (const userId of userIds) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    const userPersistence = openUserMemories(userId);
    ensureUserSessionScopes(userPersistence, userId, orgId, teamId, sessionId);
  }
}
