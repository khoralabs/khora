import { matchmakingPersonaMemoryNamespace } from "../memories/matchmaking-persona-memory-namespace.ts";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";
import { createGenericMatchmakingNegotiatorIdentity } from "./generic-matchmaking-negotiator-identity.ts";
import type { MatchmakingPersona } from "./types.ts";

const slug = "james-ortiz" as const;

const memorySeeds: MeetingSeedPayload[] = [
  {
    kind: "meeting_intent",
    text: `James here (platform, Brooklyn). Saw your thread on error envelopes—We're standardizing ours. 20 minutes to compare one RFC-sized example? I'll paste ours first; no hiring pitch.`,
  },
  {
    kind: "meeting_goal",
    text: "Agree on a single error-shape we can both live with or explicitly defer.",
    goalKind: "decision",
    priority: 1,
  },
  {
    kind: "meeting_invite",
    text: `Calendar: API error envelope peer review (20 min) · Wed May 7, 11:00am ET · Link in hold. Outcome: pick pattern or note two open forks.`,
  },
  {
    kind: "meeting_reflection",
    text: `I used to “explore synergy.” People ghosted. Now I send the doc link in the first message and ask one yes/no scope question.`,
  },
  {
    kind: "meeting_negotiation_summary",
    summaryText:
      "Last sync: aligned on machine-readable codes; disagreed on whether stack traces belong in prod payloads.",
    fitAssessment: "Compatible if we timebox and assign a shared doc owner.",
    keyEvidence: ["Both use OpenAPI 3.1", "Deadlock only on trace depth"],
    partySlug: slug,
  },
  {
    kind: "meeting_intent",
    text: `Narrow ask: do you expose retry-after on 429 consistently? We can swap screenshots—15 minutes.`,
  },
  {
    kind: "meeting_reflection",
    text: `Best intro this quarter had “decline if not API owner” in the footer. Saved everyone a round of scheduling tennis.`,
  },
];

export const matchmakingPersonaJamesOrtiz: MatchmakingPersona = {
  slug,
  displayName: "James Ortiz",
  profile: {
    tagline: "Staff engineer who wants APIs blunt, bounded, and boring in the good way.",
    about:
      "Brooklyn-based; cares about backwards compatibility, clear limits, and meetings that end on time. Skeptical of broad “coffee chats” without a shared artifact.",
  },
  get memoryNamespace() {
    return matchmakingPersonaMemoryNamespace(slug);
  },
  memorySeeds,
  async buildRegisteredIdentity() {
    return createGenericMatchmakingNegotiatorIdentity({
      personaSlug: slug,
      displayName: this.displayName,
    });
  },
};
