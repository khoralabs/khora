import type { ChatStatus } from "ai";

export type AgentLoadingMessage = {
  role: "user" | "assistant" | string;
};

export function showAgentLoading(
  awaitingOpening: boolean,
  messages: AgentLoadingMessage[],
  status: ChatStatus,
): boolean {
  if (status !== "submitted") return false;
  if (awaitingOpening && messages.length === 0) return true;
  return messages[messages.length - 1]?.role === "user";
}

export function useAgentLoadingIndicator(args: {
  status: ChatStatus;
  messages: AgentLoadingMessage[];
  awaitingOpening?: boolean;
}): boolean {
  return showAgentLoading(args.awaitingOpening ?? false, args.messages, args.status);
}
