import type { UIMessage } from "ai";

export type InterviewSession = {
  id: string;
  topic: string;
  status: string;
};

export type BeliefFeedback = "confirmed" | "corrected";

export type BeliefFeedbackRecord = {
  id: string;
  sourceMessageId: string;
  feedback: BeliefFeedback;
  correction?: string;
};

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
  beliefFeedback?: BeliefFeedbackRecord[];
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

export function extractBeliefsFromMessages(
  messages: UIMessage[],
  feedbackRecords: readonly BeliefFeedbackRecord[] = [],
): BeliefFlag[] {
  const feedbackById = new Map(feedbackRecords.map((record) => [record.id, record]));
  const beliefs: BeliefFlag[] = [];
  for (const message of messages) {
    const metadata = message.metadata as
      | { beliefFlags?: { belief: string; messageId: string }[] }
      | undefined;
    for (const flag of metadata?.beliefFlags ?? []) {
      const id = `${message.id}:${beliefs.length}`;
      const saved = feedbackById.get(id);
      beliefs.push({
        id,
        belief: flag.belief,
        sourceMessageId: flag.messageId,
        ...(saved?.feedback !== undefined ? { feedback: saved.feedback } : {}),
        ...(saved?.correction !== undefined ? { correction: saved.correction } : {}),
      });
    }
  }
  return beliefs;
}

export function mergeBeliefFeedback(
  beliefs: BeliefFlag[],
  feedbackRecords: readonly BeliefFeedbackRecord[],
): BeliefFlag[] {
  if (feedbackRecords.length === 0) return beliefs;
  const feedbackById = new Map(feedbackRecords.map((record) => [record.id, record]));
  return beliefs.map((belief) => {
    const saved = feedbackById.get(belief.id);
    if (saved === undefined) return belief;
    return {
      ...belief,
      feedback: saved.feedback,
      ...(saved.correction !== undefined ? { correction: saved.correction } : {}),
    };
  });
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

export async function patchBeliefFeedback(
  sessionId: string,
  beliefId: string,
  body: {
    sourceMessageId: string;
    feedback: BeliefFeedback;
    correction?: string;
  },
): Promise<BeliefFeedbackRecord> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/interview/beliefs/${encodeURIComponent(beliefId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    let message = `Could not save belief feedback (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) message = data.error;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }
  const data = JSON.parse(text) as { beliefFeedback: BeliefFeedbackRecord };
  return data.beliefFeedback;
}

export function interviewWsUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}
