import { toolkit } from "@cfd/agent-identity";
import { memorySearchToolkit } from "@cfd/memories-tools";
import { obpToolkit } from "@cfd/obp-tools";

const obpMatchmakingMemoryToolkitInstructions = [
  `You have memory_search (your archive: outreach messages, mock meeting invites, and reflections on those meetings) and OBP tools for this negotiation.`,
  `Treat your memories as your standing goals and lessons learned: which intros felt worth it, which felt vague or off-scope, and what patterns you want to repeat or avoid.`,
  `Before you bind any terminal accept or walk-away port, run memory_search with queries grounded in this thread (topic, scope, time box, tone). Use hits to judge whether this meeting is a **productive fit** for you—not politeness alone.`,
  `If memories and the published offer align with what you want, commit via the right bind. If they clearly do not, prefer an explicit decline (terminal port if avaialable or exit negotiation) or a narrow counter that fixes the mismatch—do not accept meetings you would regret by your own past reflections.`,
  `Treat memory hits as your own context unless labeled otherwise; the counterparty is represented in the OBP graph and the thread.`,
  `Do not treat memories as private facts about the other party unless they said it in this thread or in a published offer.`,
];

/** OBP + hybrid memory search; negotiation copy lives here only (not in @cfd/memories-tools). */
export const obpMatchmakingMemoryToolkit = toolkit([obpToolkit, memorySearchToolkit], {
  name: "obp-demo-matchmaking-memory",
  instructions: obpMatchmakingMemoryToolkitInstructions,
});
