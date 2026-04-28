import { GoalExtractorClient } from "../agents/goal-extractor/index.ts";
import { getMatchmakingDomainRuntime } from "../domain/runtime/index.ts";
import { getNegotiationModel } from "../matchmaking-obp/index.ts";

const goalExtractorIdentityInstructions = `Extract explicit user goals from invitation text only.
Do not infer hidden intent when the message does not support it.`;

const goalExtractorFormattingInstructions = `Return short, concrete goals.
Avoid duplicate phrasing and avoid schedule-only details unless they are clearly a desired outcome.`;

export async function extractAndPersistGoalsForInvite(args: {
  runId: string;
  subjectId: string;
  message: string;
}): Promise<void> {
  const extractor = new GoalExtractorClient({
    namespace: "matchmaking-goal-extractor",
    model: getNegotiationModel(),
    identityContext: { app: "matchmaking", role: "goals-extractor" },
    instructions: [goalExtractorIdentityInstructions, goalExtractorFormattingInstructions],
  });

  const { goals } = await extractor.extractGoals({ message: args.message });
  if (goals.length === 0) {
    return;
  }

  getMatchmakingDomainRuntime().persistence.createGoals({
    inviteId: args.runId,
    subjectId: args.subjectId,
    goals,
  });
}
