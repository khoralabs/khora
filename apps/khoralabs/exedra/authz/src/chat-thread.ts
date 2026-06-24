export type ParsedChatThreadId =
  | { kind: "interview"; sessionId: string; userId: string }
  | { kind: "facilitation"; sessionId: string };

/** Parse Exedra chat thread IDs like `session:{sessionId}:interview:{userId}`. */
export function parseChatThreadId(threadId: string): ParsedChatThreadId | null {
  const parts = threadId.split(":");
  if (parts[0] !== "session" || parts.length < 3) return null;

  const sessionId = parts[1];
  if (sessionId === undefined || sessionId.length === 0) return null;

  const kind = parts[2];
  if (kind === "facilitation" && parts.length === 3) {
    return { kind: "facilitation", sessionId };
  }

  if (kind === "interview" && parts.length >= 4) {
    const userId = parts.slice(3).join(":");
    if (userId.length === 0) return null;
    return { kind: "interview", sessionId, userId };
  }

  return null;
}
