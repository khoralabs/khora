import { runInterviewTurn } from "@khoralabs/exedra-interview-agent";
import { nanoid } from "nanoid";
import type { InterviewTurnWorkflowParams } from "../../../shared/interview-turn-workflow.ts";
import {
  createInterviewTelemetry,
  getAgentRegistry,
  resolveInterviewModel,
} from "./agent-runtime.ts";
import {
  completeTurn,
  failTurn,
  fetchRagContext,
  fetchTurnContext,
  loadDocumentAttachment,
  searchOrgMemories,
  searchPersonalMemories,
  TurnEventBatcher,
} from "./exedra-turn-client.ts";

export async function runInterviewTurnWorkflow(params: InterviewTurnWorkflowParams): Promise<void> {
  const turnId = params.turnId;
  const batcher = new TurnEventBatcher(turnId);

  try {
    const context = await fetchTurnContext(turnId);
    const memoryContext = await fetchRagContext({
      orgId: params.orgId,
      teamId: params.teamId,
      sessionId: params.sessionId,
      participantUserId: params.userId,
      userMessageText: context.displayText,
      sessionTopic: context.sessionTopic,
    });

    const documentAttachments = await Promise.all(
      (params.documentIds ?? []).map((documentId) => loadDocumentAttachment(documentId)),
    );

    const memorySearch = {
      searchOrgMemories: async (query: string) =>
        searchOrgMemories({ context: context.interviewMemoryContext, query }),
      ...(context.interviewMemoryContext.canSearchPersonal
        ? {
            searchPersonalMemories: async (query: string) =>
              searchPersonalMemories({ context: context.interviewMemoryContext, query }),
          }
        : {}),
    };

    const output = await runInterviewTurn({
      registry: getAgentRegistry(),
      model: resolveInterviewModel(),
      createTelemetry: createInterviewTelemetry,
      sessionId: params.sessionId,
      sessionMeta: context.sessionMeta,
      onboardingMeta: context.onboardingMeta,
      orgId: params.orgId,
      teamId: params.teamId,
      participantUserId: params.userId,
      memoryContext,
      memorySearch,
      threadInterviewComplete: context.threadInterviewComplete,
      threadId: params.threadId,
      userMessageId: params.turnId,
      history: context.history,
      userTimeZone: params.userTimeZone,
      documentAttachments,
      onTextDelta: (delta) => {
        batcher.push({ type: "text_delta", delta });
      },
      onBeliefFlag: (belief, sourceMessageId) => {
        batcher.push({ type: "belief_flag", belief, sourceMessageId });
      },
      onToolEvent: (event) => {
        if (event.type === "call") {
          batcher.push({
            type: "tool_call",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
          });
          return;
        }
        if (event.type === "result") {
          batcher.push({
            type: "tool_result",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            output: event.output,
          });
          return;
        }
        batcher.push({
          type: "tool_error",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          errorText: event.errorText,
        });
      },
    });

    await batcher.flush();

    await completeTurn(turnId, {
      assistantId: nanoid(),
      assistantParts: output.assistantParts,
      beliefFlags: output.beliefFlags,
      sessionCompleted: output.sessionCompleted,
      sessionCompletion: output.sessionCompletion,
    });
  } catch (err) {
    await batcher.flush().catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    await failTurn(turnId, message);
    throw err;
  }
}
