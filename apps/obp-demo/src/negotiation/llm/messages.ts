export function buildUserMessage(args: { threadText: string }): string {
  const { threadText } = args;
  return [
    "Shared negotiation thread (visible to all participants; includes assistant text and OBP tool activity):",
    "",
    threadText,
    "",
    "Take your turn. Use OBP tools when you need to change the graph. If a deal is ready in this demo, the buyer should bind to a terminal port on the provider's offer. After binding (or if the negotiation is otherwise complete), call obp_end_negotiation instead of repeating confirmations—no further graph changes are needed.",
  ].join("\n");
}
