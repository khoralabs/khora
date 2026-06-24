import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import type { GenerateResponsePolicyState } from "./policies/index.ts";
import type { GenerateResponseWorkflowParams } from "./types.ts";
import {
  buildUserLocalDateTimeContext,
  formatUserLocalDateTimeInstruction,
} from "./user-local-datetime.ts";

export type NormalizedGenerateResponseContext = {
  messages: UIMessage[];
  modelMessages: ModelMessage[];
  instructions: string[];
};

export async function normalizeGenerateResponseContext(
  params: GenerateResponseWorkflowParams,
  policies: GenerateResponsePolicyState,
): Promise<NormalizedGenerateResponseContext> {
  if (params.responseId.trim().length === 0) throw new Error("responseId is required");
  if (params.agent.id.trim().length === 0) throw new Error("agent.id is required");
  if (params.model.id.trim().length === 0) throw new Error("model.id is required");
  if (!Array.isArray(params.context.directives.skillNames)) {
    throw new Error("context.directives.skillNames is required");
  }
  if (params.output.chat.threadId.trim().length === 0) {
    throw new Error("output.chat.threadId is required");
  }

  const messages = params.context.messages as UIMessage[];

  const memoryInstruction =
    policies.memoryNamespaces.length > 0
      ? `Available memory namespaces: ${policies.memoryNamespaces
          .map((item) => `${item.namespace} (${item.scope}:${item.resourceId})`)
          .join(", ")}. Use searchMemories with one of these exact namespace values.`
      : "No memory namespaces are available for this invocation.";

  const modeInstruction =
    params.output.mode === "summary"
      ? "Return a concise thread summary grounded in the provided messages and available memories."
      : params.output.mode === "investigation"
        ? "Investigate the provided context and produce a direct, evidence-grounded response."
        : "Generate the next assistant message for the provided conversation.";
  const userLocalDateTimeInstruction =
    params.context.directives.userTimeZone !== undefined
      ? formatUserLocalDateTimeInstruction(
          buildUserLocalDateTimeContext(params.context.directives.userTimeZone),
        )
      : null;

  let modelMessages: ModelMessage[];
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch {
    modelMessages = messages.map((message) => ({
      role: message.role,
      content: (message.parts as Array<{ type: string; text?: string }>)
        .filter((part: { type: string }) => part.type === "text")
        .map((part: { text?: string }) => part.text ?? "")
        .join(""),
    }));
  }

  return {
    messages,
    modelMessages,
    instructions: [
      modeInstruction,
      memoryInstruction,
      userLocalDateTimeInstruction,
      ...(params.context.directives.instructions ?? []),
    ].filter((instruction): instruction is string => instruction !== null),
  };
}
