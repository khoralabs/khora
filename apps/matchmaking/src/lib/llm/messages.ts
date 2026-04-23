export function buildMatchmakingUserMessage(args: {
  threadText: string;
  /** Seat / turn order for this run only (not part of either agent’s registered identity). */
  orchestrationNote?: string;
}): string {
  const { threadText, orchestrationNote } = args;
  const head =
    orchestrationNote !== undefined && orchestrationNote.trim().length > 0
      ? [
          `${orchestrationNote.trim()}`,
          "",
          "Shared thread (visible to both agents; includes assistant text and OBP tool activity):",
        ]
      : ["Shared thread (visible to both agents; includes assistant text and OBP tool activity):"];
  return [
    ...head,
    "",
    threadText,
    "",
    "## Evidence you may use (in this order)",
    "1. **Your namespace KG** — Run **memory_search** before you assert anything about *your* user's goals, boundaries, or past behavior toward strangers. Your user's persona is **not** described in static agent instructions; it lives only in retrieved memories plus the thread below.",
    "2. **User messages in this thread** — Including any opening invitation; use them for scope and constraints.",
    "3. **Earlier turns in this thread** — Assistant text and OBP tools already said and did.",
    "",
    "Counterparty-facing claims about your user must come from (1) or neutral OBP mechanics only—never invention.",
    "",
    "Take your turn: use **memory_search** first when your reply would depend on your user's values or history, then use OBP tools when you need to change the graph. Prefer binding only when the deal fits what (1)–(3) support; otherwise decline, counter with tighter scope, or call obp_end_negotiation. Use contextual **obp_bind__*** tools only on the **other** party's exposed ports (never your own; use **obp_revoke_*** on your own offers/ports when needed).",
  ].join("\n");
}
