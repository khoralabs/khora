import { orgTeamScope, userTeamScope } from "./namespaces.js";
import { openOrgMemoriesService, openUserMemoriesService } from "./service-client.js";

export async function seedOnboardingMemories(params: {
  orgId: string;
  teamId: string;
  userId: string;
  summary: string;
  beliefs: readonly string[];
}): Promise<void> {
  const { orgId, teamId, userId, summary, beliefs } = params;
  const orgNamespace = orgTeamScope(orgId, teamId);
  const userNamespace = userTeamScope(userId, orgId, teamId);
  const orgAccess = await openOrgMemoriesService(orgId);
  const userAccess = await openUserMemoriesService(userId);

  await orgAccess.client.mergeMemory({
    kind: "node",
    key: "onboarding/summary",
    namespace: orgNamespace,
    content: [{ key: "text", text: summary }],
    labels: [],
  });

  await userAccess.client.mergeMemory({
    kind: "node",
    key: "onboarding/summary",
    namespace: userNamespace,
    content: [{ key: "text", text: summary }],
    labels: [],
  });

  for (const [index, belief] of beliefs.entries()) {
    const key = `onboarding/belief-${index + 1}`;
    await orgAccess.client.mergeMemory({
      kind: "node",
      key,
      namespace: orgNamespace,
      content: [{ key: "text", text: belief }],
      labels: [],
    });
    await userAccess.client.mergeMemory({
      kind: "node",
      key,
      namespace: userNamespace,
      content: [{ key: "text", text: belief }],
      labels: [],
    });
  }
}
