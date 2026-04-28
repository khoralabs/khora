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
    "1. **System instructions (fixed)** — Value firewall and **public profile cards** for you and your counterparty (display name, tagline, about). Treat those cards as authoritative for public-facing identity; do not use memory_search to re-derive that surface bio.",
    "2. **User messages in this thread** — Including any opening invitation; use them for scope and constraints.",
    "3. **Earlier turns in this thread** — Assistant text and OBP tools already said and did.",
    "4. **Your namespace KG** — Run **memory_search** when the reply needs history, boundaries, or preferences **not** already covered by (1)–(3).",
    "",
    "Counterparty-facing claims about your user must come from (1)–(4) or neutral OBP mechanics only—never invention.",
    "",
    "Take your turn: use **memory_search** when you need KG-backed detail beyond the fixed profile and thread; use OBP tools when you need to change the graph. Prefer binding only when the deal fits (1)–(4); otherwise decline, counter with tighter scope, or call obp_end_negotiation. Use contextual **obp_bind__*** tools only on the **other** party's exposed ports (never your own; use **obp_revoke_*** on your own offers/ports when needed).",
  ].join("\n");
}
