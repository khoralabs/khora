import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import type { GenerateResponsePolicyState } from "./policies.ts";
import type { GenerateResponseWorkflowParams } from "./types.ts";

export type NormalizedGenerateResponseContext = {
  messages: UIMessage[];
  modelMessages: ModelMessage[];
  instructions: string[];
};

export async function normalizeGenerateResponseContext(
  params: GenerateResponseWorkflowParams,
  policies: GenerateResponsePolicyState,
): Promise<NormalizedGenerateResponseContext> {
  if (!["interview", "facilitation", "thread_summary"].includes(params.kind)) {
    throw new Error(`unsupported generate response kind: ${params.kind}`);
  }
  if (params.responseId.trim().length === 0) throw new Error("responseId is required");
  if (params.agent.id.trim().length === 0) throw new Error("agent.id is required");
  if (params.model.id.trim().length === 0) throw new Error("model.id is required");
  if (params.output.chat.threadId.trim().length === 0) {
    throw new Error("output.chat.threadId is required");
  }

  const messages = params.context.messages as UIMessage[];
  if (messages.length === 0) throw new Error("context.messages must not be empty");

  const memoryInstruction =
    policies.memoryNamespaces.length > 0
      ? `Authorized memory namespaces: ${policies.memoryNamespaces
          .map((item) => `${item.namespace} (${item.scope}:${item.resourceId})`)
          .join(", ")}. Use searchMemories with one of these exact namespace values.`
      : "No memory namespaces are authorized for this invocation.";

  const modeInstruction =
    params.output.mode === "summary"
      ? "Return a concise thread summary grounded in the provided messages and authorized memories."
      : params.output.mode === "investigation"
        ? "Investigate the provided context and produce a direct, evidence-grounded response."
        : "Generate the next assistant message for the provided conversation.";

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
    instructions: [modeInstruction, memoryInstruction, ...(params.context.instructions ?? [])],
  };
}
