import { toolkit } from "@cfd/agent-identity";
import { memorySearchToolkit } from "@cfd/memories-tools";
import { obpToolkit } from "@cfd/obp-tools";

const obpMatchmakingMemoryToolkitInstructions = [
  `Each user message may include a **Retrieved from your memory namespace** block (RAG). That is your first-line archive. Prefer it before calling tools.`,
  `You still have **memory_search** for narrow follow-up queries when the injected block or thread leaves a gap. Budget is low, so use it only when needed.`,
  `Before you bind any terminal accept or walk-away port, weigh the retrieved block, thread, and any memory_search hits to judge whether this meeting is a **productive fit** for you—not politeness alone.`,
  `If memories and the published offer align with what you want, commit via the right bind. If they clearly do not, prefer an explicit decline (terminal port if available or exit negotiation) or a narrow counter that fixes the mismatch—do not accept meetings you would regret by your own past reflections.`,
  `Treat memory hits as your own context unless labeled otherwise; the counterparty is represented in the OBP graph and the thread.`,
  `Do not treat memories as private facts about the other party unless they said it in this thread or in a published offer.`,
];

/** OBP + hybrid memory search; negotiation copy lives here only (not in @cfd/memories-tools). */
export const obpMatchmakingMemoryToolkit = toolkit([obpToolkit, memorySearchToolkit], {
  name: "obp-demo-matchmaking-memory",
  instructions: obpMatchmakingMemoryToolkitInstructions,
});
