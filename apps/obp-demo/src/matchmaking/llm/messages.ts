export function buildMatchmakingUserMessage(args: {
  threadText: string;
  /** Seat / turn order for this run only (not part of either agent’s registered identity). */
  orchestrationNote?: string;
}): string {
  const { threadText, orchestrationNote } = args;
  const head =
    orchestrationNote !== undefined && orchestrationNote.trim().length > 0
      ? [`${orchestrationNote.trim()}`, "", "Shared thread (visible to both agents; includes assistant text and OBP tool activity):"]
      : ["Shared thread (visible to both agents; includes assistant text and OBP tool activity):"];
  return [
    ...head,
    "",
    threadText,
    "",
    "Take your turn. Use memory_search when you need to compare this intro to your own past intents and reflections, then use OBP tools when you need to change the graph. Prefer binding accept only when the deal is a good fit for your goals; otherwise decline or counter with tighter scope. Use the contextual obp_bind__* tools to commit on the other party's exposed ports (never your own; use obp_revoke_* to expire your own ports or offers). When the intro is decided or you have no further graph moves, call obp_end_negotiation.",
  ].join("\n");
}
