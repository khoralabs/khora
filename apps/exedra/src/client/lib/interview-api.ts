import type { UIMessage } from "ai";

export type InterviewSession = {
  id: string;
  topic: string;
  status: string;
};

export type BeliefFeedback = "confirmed" | "corrected";

export type BeliefFlag = {
  id: string;
  belief: string;
  sourceMessageId: string;
  feedback?: BeliefFeedback;
  correction?: string;
};

export type InterviewBootstrap = {
  session: InterviewSession;
  threadId: string;
  wsUrl: string;
  messages: UIMessage[];
};

export type ToolCallDisplay = {
  id: string;
  toolName: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state: "running" | "completed" | "error";
};

export type ChatMessageAttachment = {
  id: string;
  fileName: string;
  mediaType?: string;
  url?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatMessageAttachment[];
  toolCalls?: ToolCallDisplay[];
};

export function extractTextFromParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function extractBeliefsFromMessages(messages: UIMessage[]): BeliefFlag[] {
  const beliefs: BeliefFlag[] = [];
  for (const message of messages) {
    const metadata = message.metadata as
      | { beliefFlags?: { belief: string; messageId: string }[] }
      | undefined;
    for (const flag of metadata?.beliefFlags ?? []) {
      beliefs.push({
        id: `${message.id}:${beliefs.length}`,
        belief: flag.belief,
        sourceMessageId: flag.messageId,
      });
    }
  }
  return beliefs;
}

export function extractToolCallsFromParts(parts: UIMessage["parts"]): ToolCallDisplay[] {
  const toolCalls: ToolCallDisplay[] = [];
  for (const part of parts) {
    if (typeof part.type !== "string" || !part.type.startsWith("tool-")) continue;
    const toolPart = part as {
      toolCallId?: string;
      state?: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };
    const toolName = part.type.slice("tool-".length);
    toolCalls.push({
      id: toolPart.toolCallId ?? `${toolName}-${toolCalls.length}`,
      toolName,
      input: toolPart.input,
      output: toolPart.output,
      errorText: toolPart.errorText,
      state:
        toolPart.state === "output-available"
          ? "completed"
          : toolPart.state === "output-error"
            ? "error"
            : "running",
    });
  }
  return toolCalls;
}

export function uiMessagesToChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages
    .filter((message) => {
      if (message.role !== "user" && message.role !== "assistant") return false;
      const metadata = message.metadata as { kickoff?: boolean } | undefined;
      return metadata?.kickoff !== true;
    })
    .map((message) => {
      const metadata = message.metadata as
        | {
            displayText?: string;
            documents?: ChatMessageAttachment[];
          }
        | undefined;
      const content =
        typeof metadata?.displayText === "string"
          ? metadata.displayText
          : extractTextFromParts(message.parts);
      return {
        id: message.id,
        role: message.role as "user" | "assistant",
        content,
        attachments: metadata?.documents,
        toolCalls: extractToolCallsFromParts(message.parts),
      };
    })
    .filter(
      (message) =>
        message.content.length > 0 ||
        (message.attachments?.length ?? 0) > 0 ||
        (message.toolCalls?.length ?? 0) > 0,
    );
}

export async function fetchInterview(sessionId: string): Promise<InterviewBootstrap> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/interview`, {
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to load interview");
  }
  return (await res.json()) as InterviewBootstrap;
}

export function interviewWsUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}
