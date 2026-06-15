import type { UIMessage } from "ai";

export type InterviewSession = {
  id: string;
  topic: string;
  status: string;
};

export type BeliefFlag = {
  id: string;
  belief: string;
  sourceMessageId: string;
};

export type InterviewBootstrap = {
  session: InterviewSession;
  threadId: string;
  wsUrl: string;
  messages: UIMessage[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
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

export function uiMessagesToChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages
    .filter((message) => {
      if (message.role !== "user" && message.role !== "assistant") return false;
      const metadata = message.metadata as { kickoff?: boolean } | undefined;
      return metadata?.kickoff !== true;
    })
    .map((message) => ({
      id: message.id,
      role: message.role as "user" | "assistant",
      content: extractTextFromParts(message.parts),
    }))
    .filter((message) => message.content.length > 0);
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
