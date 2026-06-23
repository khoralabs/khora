import type { AuthzClient } from "../authz-client.ts";
import type { GenerateResponseWorkflowParams } from "../types.ts";
import type { GenerateResponsePolicyState } from "./types.ts";

export async function evaluateChatThreadWriteAccess(
  params: GenerateResponseWorkflowParams,
  authz: AuthzClient,
): Promise<boolean> {
  const requestedWrite = params.access.chatThread?.write === true;
  const targetThread = params.access.chatThread?.threadId ?? params.output.chat.threadId;
  return requestedWrite && (await authz.canWriteChatThread(params.agent.actingFor, targetThread));
}

export function requireChatWriteAccess(state: GenerateResponsePolicyState, threadId: string): void {
  if (!state.canWriteChatThread) {
    throw new Error(`agent is not authorized to write chat thread ${threadId}`);
  }
}
