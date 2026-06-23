import { policy } from "@khoralabs/agent-capabilities";

import type { AuthzClient, MemoryNamespaceAccess } from "../authz-client.ts";
import type { GenerateResponseToolkitEnv } from "../tools/types.ts";
import type { GenerateResponseWorkflowParams } from "../types.ts";

export const hasMemoryNamespaces = policy(
  "has-memory-namespaces",
  async (env: GenerateResponseToolkitEnv) =>
    Promise.resolve(env.policyState.memoryNamespaces.length > 0),
);

export async function evaluateMemoryNamespaceAccess(
  params: GenerateResponseWorkflowParams,
  authz: AuthzClient,
): Promise<MemoryNamespaceAccess[]> {
  const subject = params.agent.actingFor;
  return (
    await Promise.all(
      (params.access.memoryNamespaces ?? []).map(async (namespace) =>
        (await authz.canReadMemoryNamespace(subject, namespace)) ? namespace : null,
      ),
    )
  ).filter((namespace): namespace is MemoryNamespaceAccess => namespace !== null);
}
