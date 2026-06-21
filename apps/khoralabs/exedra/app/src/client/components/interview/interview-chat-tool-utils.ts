import type { MessageAuthor } from "@shared/messages/author";
import type { ChatMessage, ToolCallDisplay } from "@/lib/interview-api";

export function upsertMessageToolCall(
  message: ChatMessage,
  toolCall: ToolCallDisplay,
): ChatMessage {
  const existing = message.toolCalls ?? [];
  const index = existing.findIndex((call) => call.id === toolCall.id);
  if (index >= 0) {
    const next = [...existing];
    next[index] = { ...next[index], ...toolCall };
    return { ...message, toolCalls: next };
  }
  return { ...message, toolCalls: [...existing, toolCall] };
}

export function upsertStreamingToolCall(
  messages: ChatMessage[],
  streamingId: string,
  toolCall: ToolCallDisplay,
  agentAuthor: MessageAuthor | null,
): ChatMessage[] {
  const existing = messages.find((message) => message.id === streamingId);
  if (existing !== undefined) {
    return messages.map((message) =>
      message.id === streamingId ? upsertMessageToolCall(message, toolCall) : message,
    );
  }
  return [
    ...messages,
    {
      id: streamingId,
      role: "assistant",
      content: "",
      createdAtMs: Date.now(),
      author: agentAuthor,
      toolCalls: [toolCall],
    },
  ];
}

export function toolStateForDisplay(state: ToolCallDisplay["state"]) {
  if (state === "completed") return "output-available" as const;
  if (state === "error") return "output-error" as const;
  return "input-available" as const;
}
