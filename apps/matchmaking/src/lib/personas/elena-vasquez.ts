import { matchmakingPersonaMemoryNamespace } from "../memories/matchmaking-persona-memory-namespace.ts";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";
import { createGenericMatchmakingNegotiatorIdentity } from "./generic-matchmaking-negotiator-identity.ts";
import type { MatchmakingPersona } from "./types.ts";

const slug = "elena-vasquez" as const;

const memorySeeds: MeetingSeedPayload[] = [
  {
    kind: "meeting_intent",
    text: `Elena here — PM at a climate fintech in Austin. Your breakdown on embedded insurance for resilience projects matched a partnership wedge we're testing. 25 minutes to compare customer proof points?`,
  },
  {
    kind: "meeting_goal",
    text: "Surface one credible case study pattern we could co-reference without overclaiming.",
    goalKind: "discovery",
    priority: 1,
  },
  {
    kind: "meeting_invite",
    text: `Hold: Climate fintech × resilience coverage (25 min) · Tue May 20, 10:30am CT · Agenda: ICP, one case study each, no term sheet.`,
  },
  {
    kind: "meeting_reflection",
    text: `I learned to put the “what we won't do in this call” line in the invite—it keeps ambitious partners from steamrolling the scope.`,
  },
  {
    kind: "meeting_negotiation_summary",
    summaryText:
      "Earlier chat: excitement on data hooks; legal wanted clearer delineation on advisory vs. product claims.",
    fitAssessment: "Strong if next step is a mutual NDA and a redacted deck.",
    keyEvidence: ["Shared ICP deck", "Asked for claims scrub process"],
    partySlug: slug,
    counterpartySlug: "_peer_",
  },
  {
    kind: "meeting_intent",
    text: `Micro-ask: who on your side owns narrative review for joint outbound? I can match their calendar.`,
  },
  {
    kind: "meeting_reflection",
    text: `Best intros lately came from naming the risk we're trying to disprove in the subject line.`,
  },
];

export const matchmakingPersonaElenaVasquez: MatchmakingPersona = {
  slug,
  displayName: "Elena Vasquez",
  profile: {
    tagline: "Climate fintech PM pairing bold narratives with defensible proof.",
    about:
      "Austin; ships partner-facing product narratives with legal and climate integrity in mind. Likes structured intros, explicit non-goals, and follow-ups that reference decisions, not vibes.",
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
