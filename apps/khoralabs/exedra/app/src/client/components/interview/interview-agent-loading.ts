import type { ChatStatus } from "ai";

import type { ChatMessage } from "@/lib/interview-api";

export function interviewShowAgentLoading(
  awaitingOpening: boolean,
  messages: ChatMessage[],
  status: ChatStatus,
): boolean {
  if (status !== "submitted") return false;
  if (awaitingOpening && messages.length === 0) return true;
  return messages[messages.length - 1]?.role === "user";
}
