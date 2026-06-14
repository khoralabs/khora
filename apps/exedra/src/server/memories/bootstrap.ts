import { ensureOrgTeamScopes, ensureUserTeamScopes } from "./namespaces.js";
import { resolveOrgMemoriesDbPath, resolveUserMemoriesDbPath } from "./paths.js";
import { openOrgMemories, openUserMemories } from "./store.js";

export type BootstrapOrgTeamMemoriesParams = {
  orgId: string;
  teamId: string;
  userId: string;
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
