export type ExedraChatThreadKind = "interview" | "facilitation";

export function sessionChannelId(sessionId: string): string {
  return `session:${sessionId}`;
}

export function interviewChatThreadId(sessionId: string, userId: string): string {
  return `session:${sessionId}:interview:${userId}`;
}

export function facilitationChatThreadId(sessionId: string): string {
  return `session:${sessionId}:facilitation`;
}

export function parseSessionChatThreadId(
  threadId: string,
):
  | { kind: "interview"; sessionId: string; userId: string }
  | { kind: "facilitation"; sessionId: string }
  | null {
  const parts = threadId.split(":");
  const sessionId = parts[1];
  const kind = parts[2];
  if (parts[0] !== "session" || sessionId === undefined || kind === undefined) return null;
  if (kind === "interview") {
    const userId = parts.slice(3).join(":");
    return userId.length > 0 ? { kind, sessionId, userId } : null;
  }
  if (kind === "facilitation" && parts.length === 3) {
    return { kind, sessionId };
  }
  return null;
}
