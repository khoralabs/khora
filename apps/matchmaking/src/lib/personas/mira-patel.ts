import { matchmakingPersonaMemoryNamespace } from "../memories/matchmaking-persona-memory-namespace.ts";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";
import { createGenericMatchmakingNegotiatorIdentity } from "./generic-matchmaking-negotiator-identity.ts";
import type { MatchmakingPersona } from "./types.ts";

const slug = "mira-patel" as const;

const memorySeeds: MeetingSeedPayload[] = [
  {
    kind: "meeting_intent",
    text: `Hi — I'm Mira, product lead at a small health-analytics shop. Your post on staged rollouts in regulated orgs matched what we're debugging. Could we do 25 minutes next week? Happy to send a one-screen outline first—no pitch deck.`,
  },
  {
    kind: "meeting_goal",
    text: "Leave with one concrete checklist for HIPAA-adjacent onboarding without slowing sales cycles.",
    goalKind: "outcome",
    priority: 1,
  },
  {
    kind: "meeting_invite",
    text: `Invite: Intro — regulated rollout patterns (25 min) · Video · Tue May 6, 9:30–9:55am PT or Thu May 8, 1:00–1:25pm PT. Agenda: your staged rollout post + two questions from our side.`,
  },
  {
    kind: "meeting_reflection",
    text: `Last intro I ran cold-opened with context and lost them in two minutes. Now I lead with the shared artifact and one sharp question.`,
  },
  {
    kind: "meeting_negotiation_summary",
    summaryText:
      "Prior 20m chat: strong overlap on phased consent UX; they wanted clearer data-retention language before a follow-up.",
    fitAssessment: "Worth a second call if we bring a one-page retention sketch.",
    keyEvidence: ["Asked for retention diagram", "Offered to share vendor questionnaire"],
    partySlug: slug,
    counterpartySlug: "_peer_",
  },
  {
    kind: "meeting_intent",
    text: `Following up narrowly: I'd love 15 minutes on how you phrase “minimum viable audit trail” to buyers—text only, no demo.`,
  },
  {
    kind: "meeting_reflection",
    text: `The invite that worked named the compliance anxiety in the subject line and capped bullets at three. We actually finished early.`,
  },
];

export const matchmakingPersonaMiraPatel: MatchmakingPersona = {
  slug,
  displayName: "Mira Patel",
  profile: {
    tagline: "Product lead calibrating regulated rollouts without stalling momentum.",
    about:
      "Mumbai → Bay Area; ships analytics for care teams. Cares about crisp consent copy, staged rollouts, and intros that respect legal review timelines. Prefers short agendas and written takeaways.",
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
