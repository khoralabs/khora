import { matchmakingPersonaMemoryNamespace } from "../memories/matchmaking-persona-memory-namespace.ts";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";
import { createGenericMatchmakingNegotiatorIdentity } from "./generic-matchmaking-negotiator-identity.ts";
import type { MatchmakingPersona } from "./types.ts";

const memorySeeds: MeetingSeedPayload[] = [
  {
    kind: "meeting_intent",
    text: `Hi — I'm reaching out because your team's rollout write-up matched a problem we're hitting on enterprise onboarding. Could we do 25 minutes next week? I'd love to compare notes, not pitch; happy to send a one-pager first if that helps.`,
  },
  {
    kind: "meeting_reflection",
    text: `That first chat happened but felt rushed; they were polite and vague. I learned to lead with the concrete ask and one proof point instead of warming up with context.`,
  },
  {
    kind: "meeting_invite",
    text: `You're invited: Intro — product & rollout (25 min) · Video · Proposed: Tue Apr 8, 2:00-2:25pm PT or Wed Apr 9, 10:00-10:25am PT. Reply with one slot or propose another.`,
  },
  {
    kind: "meeting_reflection",
    text: `The invite I sent for that slot worked: we showed up, agenda was on the calendar, and we booked a follow-up doc pass. Worth it because expectations were explicit in the invite body.`,
  },
  {
    kind: "meeting_intent",
    text: `Hey — a mutual connection suggested I ping you about API ergonomics only (narrow scope). If you're open, I'd like 20 minutes to walk through one integration pattern—no broader GTM pitch.`,
  },
  {
    kind: "meeting_invite",
    text: `Invitation: Peer sync — API ergonomics (20 min) · Meet · Thu Apr 17, 11:00am PT · Agenda: one integration walkthrough + Q&A. Decline or propose alternate if the time doesn't work.`,
  },
  {
    kind: "meeting_reflection",
    text: `That second invite's meeting landed well: we stayed in scope and ended on time. I'm carrying forward “narrow topic in the subject line + agenda in the invite.”`,
  },
];

export const matchmakingPersonaP1: MatchmakingPersona = {
  slug: "p1",
  displayName: "Peer (rollout & proof points)",
  profile: {
    tagline: "Enterprise rollout intros with tight scope and proof points.",
    about:
      "Peers on product and rollout: compares notes, sends narrow invites, and uses past meeting reflections to avoid vague syncs. Good fit when you want a time-boxed technical or GTM conversation—not a broad pitch.",
  },
  get memoryNamespace() {
    return matchmakingPersonaMemoryNamespace("p1");
  },
  memorySeeds,
  async buildRegisteredIdentity() {
    return createGenericMatchmakingNegotiatorIdentity({
      personaSlug: "p1",
      displayName: this.displayName,
    });
  },
};
