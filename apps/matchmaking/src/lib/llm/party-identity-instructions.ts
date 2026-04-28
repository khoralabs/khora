import type { UserPublicProfileBody } from "../user-public-profile.ts";

export type NegotiationPublicCard = {
  displayName: string;
  tagline: string;
  about: string;
};

/** Fixed card for Party A from domain / legacy profile (same source as directory API). */
export function negotiationPublicCardFromUserProfile(
  state: UserPublicProfileBody | null,
): NegotiationPublicCard {
  if (state === null) {
    return {
      displayName: "(Public profile not set)",
      tagline: "",
      about:
        "The human has not completed a public directory profile. Negotiate conservatively. Do not invent a display name or biography. Use memory_search only for facts already stored in your namespace.",
    };
  }
  return {
    displayName: state.displayName,
    tagline: state.tagline,
    about: state.about,
  };
}

function formatPublicCardSection(title: string, card: NegotiationPublicCard): string {
  const lines: string[] = [title, ""];
  lines.push(`- **Display name:** ${card.displayName.trim() || "—"}`);
  const tag = card.tagline.trim();
  if (tag.length > 0) {
    lines.push(`- **Tagline:** ${tag}`);
  }
  const about = card.about.trim();
  if (about.length > 0) {
    lines.push(`- **About:** ${about}`);
  }
  return lines.join("\n");
}

export function buildMatchmakingPartySystemInstructions(
  valueFirewallBase: string,
  args: {
    selfCard: NegotiationPublicCard;
    counterpartyCard: NegotiationPublicCard;
    partyLetter: "A" | "B";
    hasUserInvitationLine: boolean;
  },
): string {
  const { selfCard, counterpartyCard, partyLetter, hasUserInvitationLine } = args;
  const selfBlock = formatPublicCardSection("### You represent (public directory card)", selfCard);
  const cpBlock = formatPublicCardSection(
    "### Your counterparty (public directory card)",
    counterpartyCard,
  );
  const inviteNote = hasUserInvitationLine
    ? partyLetter === "A"
      ? "The opening user-authored line in the shared thread is **your** user's invitation."
      : "The opening user-authored line in the shared thread is from **Party A's user** (your counterparty). Respond to that invitation; address them by the counterparty card above, not as yourself."
    : "";

  const roleLines = [
    "### Role",
    "",
    `- You are **Party ${partyLetter}** (Party A = first registered seat / requester; Party B = second / invitee).`,
    "",
    "**Identity vs memory:** Treat the *You represent* block above as authoritative for your user's **public** name, tagline, and about in this run. Use **memory_search** only for additional KG facts (history, preferences, meeting memories) that are not stated there—**not** to discover the public display name or bio.",
    ...(inviteNote ? ["", inviteNote] : []),
  ];

  return [
    valueFirewallBase,
    "",
    "## Negotiation identity (fixed)",
    "",
    selfBlock,
    "",
    cpBlock,
    "",
    ...roleLines,
  ].join("\n");
}
