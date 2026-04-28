import { matchmakingPersonaMemoryNamespace } from "../memories/matchmaking-persona-memory-namespace.ts";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";
import { createGenericMatchmakingNegotiatorIdentity } from "./generic-matchmaking-negotiator-identity.ts";
import type { MatchmakingPersona } from "./types.ts";

const slug = "sara-kim" as const;

const memorySeeds: MeetingSeedPayload[] = [
  {
    kind: "meeting_intent",
    text: `Hey — Sara (design ops / research, Seattle). Your write-up on async critique rituals matched an experiment we're running. Could we async-first (Loom + doc comments) and only meet if we're stuck?`,
  },
  {
    kind: "meeting_goal",
    text: "Capture two rituals we can try for two sprints without new tooling.",
    goalKind: "learning",
    priority: 2,
  },
  {
    kind: "meeting_invite",
    text: `Optional live slot: Design ops async patterns (25 min) · Mon May 12, 8:00am PT — only if doc comments stall. Otherwise I'll close the loop by EOD Thursday.`,
  },
  {
    kind: "meeting_reflection",
    text: `I over-scheduled intros last quarter. Defaulting to written context first cut wasted meetings by half.`,
  },
  {
    kind: "meeting_negotiation_summary",
    summaryText:
      "Prior thread: shared a FigJam template; they wanted more structure on feedback SLAs.",
    fitAssessment: "Good fit if we keep expectations explicit in the doc header.",
    keyEvidence: ["Both use weekly design critiques", "Asked for SLA wording"],
    partySlug: slug,
    counterpartySlug: "_peer_",
  },
  {
    kind: "meeting_intent",
    text: `Lightweight: I'm collecting one-paragraph “how we say no politely” snippets from teams under 30—want to trade?`,
  },
  {
    kind: "meeting_reflection",
    text: `The invites that respect timezone labels and offer a doc link get faster replies from parents on our team.`,
  },
];

export const matchmakingPersonaSaraKim: MatchmakingPersona = {
  slug,
  displayName: "Sara Kim",
  profile: {
    tagline: "Design ops lead optimizing feedback loops without meeting debt.",
    about:
      "Seattle; bridges research and delivery. Values async defaults, short live sessions, and psychological safety in critique. Intro requests should show the artifact, not the résumé.",
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
