import { matchmakingPersonaMemoryNamespace } from "../memories/matchmaking-persona-memory-namespace.ts";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";
import { createGenericMatchmakingNegotiatorIdentity } from "./generic-matchmaking-negotiator-identity.ts";
import type { MatchmakingPersona } from "./types.ts";

const slug = "devon-mack" as const;

const memorySeeds: MeetingSeedPayload[] = [
  {
    kind: "meeting_intent",
    text: `Hi, Devon Mack (ED, community workforce nonprofit, Chicago). We're piloting a cohort model similar to something you funded elsewhere. Could we do 30 minutes on what metrics you actually read in month three—not the pitch deck metrics?`,
  },
  {
    kind: "meeting_goal",
    text: "Understand whether our pilot design fits your portfolio thesis on earn-and-learn programs.",
    goalKind: "alignment",
    priority: 1,
  },
  {
    kind: "meeting_invite",
    text: `Invite: Funder ↔ pilot metrics (30 min) · Thu May 15, 12:00pm CT · Video. I'll send a one-page cohort outline beforehand.`,
  },
  {
    kind: "meeting_reflection",
    text: `Donors used to get long pre-reads from me. Shorter memos with three risks upfront get better conversations.`,
  },
  {
    kind: "meeting_negotiation_summary",
    summaryText:
      "Initial call: aligned on youth employment outcomes; they needed clearer sustainability plan for year two.",
    fitAssessment: "Promising if we bring a simple cohort budget scenario.",
    keyEvidence: ["Asked about subsidy taper", "Complimented participant stories"],
    partySlug: slug,
  },
  {
    kind: "meeting_intent",
    text: `Following up: would a 10-minute voice memo on partner employer commitments be easier than another live block this week?`,
  },
  {
    kind: "meeting_reflection",
    text: `When I named trade-offs in the invite (“happy to hear no if timing is wrong”), people rescheduled less awkwardly.`,
  },
];

export const matchmakingPersonaDevonMack: MatchmakingPersona = {
  slug,
  displayName: "Devon Mack",
  profile: {
    tagline: "Nonprofit ED building earn-and-learn programs with honest constraints.",
    about:
      "Chicago-based; focuses on community hiring partnerships and grant reporting that doesn't bury the story. Appreciates direct questions and realistic timelines.",
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
