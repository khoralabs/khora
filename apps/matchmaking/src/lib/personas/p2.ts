import { matchmakingPersonaMemoryNamespace } from "../memories/matchmaking-persona-memory-namespace.ts";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";
import { createGenericMatchmakingNegotiatorIdentity } from "./generic-matchmaking-negotiator-identity.ts";
import type { MatchmakingPersona } from "./types.ts";

const memorySeeds: MeetingSeedPayload[] = [
  {
    kind: "meeting_intent",
    text: `Thanks for the intro request — I'm interested in a short coffee chat about whether your GTM could inform our partner program. If you're up for it, propose two windows and I'll confirm.`,
  },
  {
    kind: "meeting_reflection",
    text: `We met but the thread wandered; useful contact, expensive morning. I'm now asking for a written agenda before I accept.`,
  },
  {
    kind: "meeting_invite",
    text: `You're invited: Coffee — partner program fit (30 min) · In person · Mon May 5, 9:30am · Location: [cafe]. Optional: add one bullet on what you want out of the chat.`,
  },
  {
    kind: "meeting_reflection",
    text: `That invite was too open-ended; the meeting ran long. Next time I'll reply with “happy to do 20 min with three agenda bullets” before accepting.`,
  },
  {
    kind: "meeting_intent",
    text: `Hi — your research overlaps ours; I'd like a peer exchange, not a sales call. If you're open, suggest two 25-minute slots and I'll pick one.`,
  },
  {
    kind: "meeting_invite",
    text: `Invitation: Research peer sync (25 min) · Video · Wed May 14, 3:00pm PT · Agenda: compare notes on [topic] + optional follow-up list. RSVP or counter-propose.`,
  },
  {
    kind: "meeting_reflection",
    text: `That invite-style meeting worked: we traded notes and ended on time. I'm keeping “specific ask + time box in the invite” as my filter for yes.`,
  },
];

export const matchmakingPersonaP2: MatchmakingPersona = {
  slug: "p2",
  displayName: "Peer (programs & research syncs)",
  profile: {
    tagline: "Partner programs and research-style peer syncs.",
    about:
      "Interested in short coffee chats and structured peer exchanges when agendas are clear. Filters out open-ended “explore” meetings in favor of written bullets and explicit time boxes.",
  },
  get memoryNamespace() {
    return matchmakingPersonaMemoryNamespace("p2");
  },
  memorySeeds,
  async buildRegisteredIdentity() {
    return createGenericMatchmakingNegotiatorIdentity({
      personaSlug: "p2",
      displayName: this.displayName,
    });
  },
};
