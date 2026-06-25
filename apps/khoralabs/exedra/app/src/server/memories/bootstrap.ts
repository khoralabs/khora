import {
  orgScope,
  orgSessionScope,
  orgTeamScope,
  userScope,
  userSessionScope,
  userTeamScope,
} from "./namespaces.js";
import { openOrgMemoriesService, openUserMemoriesService } from "./service-client.js";

const GLOBAL_ROOT = "_global_";

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

export async function bootstrapOrgTeamMemories(params: BootstrapOrgTeamMemoriesParams): Promise<{
  orgDatabase: { kind: string; ownerKey: string };
  userDatabase: { kind: string; ownerKey: string };
}> {
  const { orgId, teamId, userId } = params;
  const orgAccess = await openOrgMemoriesService(orgId);
  const userAccess = await openUserMemoriesService(userId);

  await orgAccess.reads.ensureScopeChain([
    GLOBAL_ROOT,
    orgScope(orgId),
    orgTeamScope(orgId, teamId),
  ]);
  await userAccess.reads.ensureScopeChain([
    GLOBAL_ROOT,
    userScope(userId),
    userTeamScope(userId, orgId, teamId),
  ]);

  return {
    orgDatabase: orgAccess.database,
    userDatabase: userAccess.database,
  };
}

/** Ensure org + user session namespaces under the team hierarchy. Idempotent. */
export async function bootstrapSessionMemories(
  params: BootstrapSessionMemoriesParams,
): Promise<void> {
  const { orgId, teamId, sessionId, userIds } = params;
  const orgAccess = await openOrgMemoriesService(orgId);
  await orgAccess.reads.ensureScopeChain([
    GLOBAL_ROOT,
    orgScope(orgId),
    orgTeamScope(orgId, teamId),
    orgSessionScope(orgId, teamId, sessionId),
  ]);

  const seen = new Set<string>();
  for (const userId of userIds) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    const userAccess = await openUserMemoriesService(userId);
    await userAccess.reads.ensureScopeChain([
      GLOBAL_ROOT,
      userScope(userId),
      userTeamScope(userId, orgId, teamId),
      userSessionScope(userId, orgId, teamId, sessionId),
    ]);
  }
}
