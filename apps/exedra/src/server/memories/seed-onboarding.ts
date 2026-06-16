import { mergeMemory } from "@khoralabs/memories-core";

import { orgTeamScope, userTeamScope } from "./namespaces.js";
import { openOrgMemories, openUserMemories } from "./store.js";

export function seedOnboardingMemories(params: {
  orgId: string;
  teamId: string;
  userId: string;
  summary: string;
  beliefs: readonly string[];
}): void {
  const { orgId, teamId, userId, summary, beliefs } = params;
  const orgNamespace = orgTeamScope(orgId, teamId);
  const userNamespace = userTeamScope(userId, orgId, teamId);
  const orgPersistence = openOrgMemories(orgId);
  const userPersistence = openUserMemories(userId);

  mergeMemory(
    { persistence: orgPersistence },
    {
      kind: "node",
      key: "onboarding/summary",
      namespace: orgNamespace,
      content: [{ key: "text", text: summary }],
      labels: [],
    },
  );

  mergeMemory(
    { persistence: userPersistence },
    {
      kind: "node",
      key: "onboarding/summary",
      namespace: userNamespace,
      content: [{ key: "text", text: summary }],
      labels: [],
    },
  );

  beliefs.forEach((belief, index) => {
    const key = `onboarding/belief-${index + 1}`;
    mergeMemory(
      { persistence: orgPersistence },
      {
        kind: "node",
        key,
        namespace: orgNamespace,
        content: [{ key: "text", text: belief }],
        labels: [],
      },
    );
    mergeMemory(
      { persistence: userPersistence },
      {
        kind: "node",
        key,
        namespace: userNamespace,
        content: [{ key: "text", text: belief }],
        labels: [],
      },
    );
  });
}
