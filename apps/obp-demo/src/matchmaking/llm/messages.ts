export function buildMatchmakingUserMessage(args: { threadText: string }): string {
  const { threadText } = args;
  return [
    "Shared thread (visible to both agents; includes assistant text and OBP tool activity):",
    "",
    threadText,
    "",
    "Take your turn. Use OBP tools when you need to change the graph. Use the contextual obp_bind__* tools to commit on the other party's exposed ports (never your own; use obp_revoke_* to expire your own ports or offers). When the intro is decided or you have no further graph moves, call obp_end_negotiation.",
  ].join("\n");
}
