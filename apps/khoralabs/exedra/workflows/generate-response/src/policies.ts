import type { AuthzClient, MemoryNamespaceAccess } from "./authz-client.ts";
import type { GenerateResponseWorkflowParams } from "./types.ts";

export type GenerateResponsePolicyState = {
  memoryNamespaces: MemoryNamespaceAccess[];
  documentIds: string[];
  canWriteChatThread: boolean;
  flags: Record<string, boolean>;
};

export async function evaluateGenerateResponsePolicies(
  params: GenerateResponseWorkflowParams,
  authz: AuthzClient,
): Promise<GenerateResponsePolicyState> {
  const subject = params.agent.actingFor;
  const memoryNamespaces = (
    await Promise.all(
      (params.access.memoryNamespaces ?? []).map(async (namespace) =>
        (await authz.canReadMemoryNamespace(subject, namespace)) ? namespace : null,
      ),
    )
  ).filter((namespace): namespace is MemoryNamespaceAccess => namespace !== null);

  const documentIds = (
    await Promise.all(
      (params.access.documentIds ?? []).map(async (documentId) =>
        (await authz.canReadDocument(subject, documentId)) ? documentId : null,
      ),
    )
  ).filter((documentId): documentId is string => documentId !== null);

  const requestedWrite = params.access.chatThread?.write === true;
  const targetThread = params.access.chatThread?.threadId ?? params.output.chat.threadId;
  const canWriteChatThread =
    requestedWrite && (await authz.canWriteChatThread(subject, targetThread));

  return {
    memoryNamespaces,
    documentIds,
    canWriteChatThread,
    flags: params.access.policyFlags ?? {},
  };
}

export function requireChatWriteAccess(state: GenerateResponsePolicyState, threadId: string): void {
  if (!state.canWriteChatThread) {
    throw new Error(`agent is not authorized to write chat thread ${threadId}`);
  }
}
