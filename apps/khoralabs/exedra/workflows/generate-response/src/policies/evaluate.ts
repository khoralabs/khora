import type { AuthzClient } from "../authz-client.ts";
import type { GenerateResponseWorkflowParams } from "../types.ts";
import { evaluateChatThreadWriteAccess } from "./chat-write-policy.ts";
import { evaluateDocumentReadAccess } from "./document-read-policy.ts";
import { evaluateMemoryNamespaceAccess } from "./memory-namespace-policy.ts";
import { evaluateSkillDirectives } from "./skill-activation-policy.ts";
import type { GenerateResponsePolicyState } from "./types.ts";

export async function evaluateGenerateResponsePolicies(
  params: GenerateResponseWorkflowParams,
  authz: AuthzClient,
): Promise<GenerateResponsePolicyState> {
  const [memoryNamespaces, documentIds, canWriteChatThread] = await Promise.all([
    evaluateMemoryNamespaceAccess(params, authz),
    evaluateDocumentReadAccess(params, authz),
    evaluateChatThreadWriteAccess(params, authz),
  ]);

  return {
    memoryNamespaces,
    documentIds,
    canWriteChatThread,
    skillNames: evaluateSkillDirectives(params),
    flags: params.access.policyFlags ?? {},
  };
}
