export function buildMatchmakingUserMessage(args: {
  threadText: string;
  /** Seat / turn order for this run only (not part of either agent’s registered identity). */
  orchestrationNote?: string;
  /** Programmatic hybrid retrieval for this turn (RAG); omit when unavailable. */
  retrievedMemoryContext?: string | null;
}): string {
  const { threadText, orchestrationNote, retrievedMemoryContext } = args;

  const lines: string[] = [];
  if (orchestrationNote !== undefined && orchestrationNote.trim().length > 0) {
    lines.push(orchestrationNote.trim(), "");
  }
  if (
    retrievedMemoryContext !== undefined &&
    retrievedMemoryContext !== null &&
    retrievedMemoryContext.trim().length > 0
  ) {
    lines.push(
      "## Retrieved from your memory namespace (evidence)",
      "",
      retrievedMemoryContext.trim(),
      "",
      "Prefer this block for KG-backed recall; use **memory_search** only if you need additional detail not covered here.",
      "",
    );
  }
  lines.push(
    "Shared thread (visible to both agents; includes assistant text and OBP tool activity):",
    "",
    threadText,
    "",
    "## Evidence you may use (in this order)",
    "1. **System instructions (fixed)** — Value firewall and **public profile cards** for you and your counterparty (display name, tagline, about). Treat those cards as authoritative for public-facing identity; do not use memory_search to re-derive that surface bio.",
    '2. **Retrieved KG excerpts** — The "Retrieved from your memory namespace" section above (when present), pre-filled for this turn.',
    "3. **User messages in this thread** — Including any opening invitation; use them for scope and constraints.",
    "4. **Earlier turns in this thread** — Assistant text and OBP tools already said and did.",
    "5. **memory_search (fallback)** — Narrow follow-up queries only when (1)–(4) leave a gap.",
    "",
    "Counterparty-facing claims about your user must come from (1)–(5) or neutral OBP mechanics only—never invention.",
    "",
    "Take your turn: default to the retrieved block and thread; call **memory_search** sparingly for targeted gaps; use OBP tools when you need to change the graph. Prefer binding only when the deal fits (1)–(5); otherwise decline, counter with tighter scope, or call obp_end_negotiation. Use contextual **obp_bind__*** tools only on the **other** party's exposed ports (never your own; use **obp_revoke_*** on your own offers/ports when needed).",
  );
  return lines.join("\n");
}
