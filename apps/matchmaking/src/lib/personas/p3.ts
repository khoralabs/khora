import { matchmakingPersonaMemoryNamespace } from "../memories/matchmaking-persona-memory-namespace.ts";
import type { MeetingSeedPayload } from "../memories/meeting-seed-payload.ts";
import { createGenericMatchmakingNegotiatorIdentity } from "./generic-matchmaking-negotiator-identity.ts";
import type { MatchmakingPersona } from "./types.ts";

/** Nonprofit / public-sector ops + personal boundary lessons—distinct from the product/GTM personas in p1 and p2. */
const memorySeeds: MeetingSeedPayload[] = [
  {
    kind: "meeting_intent",
    text: `Hi — I run grants ops for a regional arts council. Your municipality's open-data pilot notes line up with how we score outcomes. Could we do 20 minutes to compare rubrics—not a vendor pitch, just practitioner to practitioner?`,
  },
  {
    kind: "meeting_reflection",
    text: `That “general sync” with a funder went nowhere; we circled mission statements. I now ask for one example grant packet and the decision timeline before I accept.`,
  },
  {
    kind: "meeting_invite",
    text: `You're invited: Office hours — municipal data pilot rubrics (20 min) · Video · Tue Jun 3, 8:00-8:20am PT · Bring one anonymized scoring sheet or pass; otherwise we reschedule.`,
  },
  {
    kind: "meeting_reflection",
    text: `That office-hours format worked: we stayed on the rubric doc and ended early. I'm keeping “bring an artifact or skip the slot” as my filter for yes.`,
  },
  {
    kind: "meeting_intent",
    text: `I'm a hospital throughput analyst (different day job) volunteering on a literacy nonprofit board. If you're open, I'd like 15 minutes on waitlist triage playbooks—narrow scope, no HIPAA stories.`,
  },
  {
    kind: "meeting_invite",
    text: `Invitation: Volunteer-only — triage playbooks (15 min) · Phone · Thu Jun 12, 5:45pm PT · Agenda: two metrics + one handoff pattern. Decline if you need a broader operations audit.`,
  },
  {
    kind: "meeting_reflection",
    text: `Ultramarathon training taught me to guard morning blocks; that invite respected the time box. I'm carrying “hard stop + one artifact” into both grant calls and long-run weekends.`,
  },
];

export const matchmakingPersonaP3: MatchmakingPersona = {
  slug: "p3",
  displayName: "Peer (civic & grants ops)",
  profile: {
    tagline: "Grants ops, civic data, and volunteer-time boundaries.",
    about:
      "Runs arts-council grants ops and volunteers on literacy boards—asks for concrete artifacts (rubrics, timelines) before saying yes. Prefers office-hours formats and hard stops so civic and day-job time stay protected.",
  },
  get memoryNamespace() {
    return matchmakingPersonaMemoryNamespace("p3");
  },
  memorySeeds,
  async buildRegisteredIdentity() {
    return createGenericMatchmakingNegotiatorIdentity({
      personaSlug: "p3",
      displayName: this.displayName,
    });
  },
};
