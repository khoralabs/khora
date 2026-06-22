import { runFacilitationEvent } from "@khoralabs/exedra-facilitation-agent";
import { nanoid } from "nanoid";

import type { FacilitationWorkflowParams } from "../../../shared/facilitation-workflow.ts";
import { resolveFacilitationModel } from "./agent-runtime.ts";
import {
  appendFacilitationMessage,
  fetchParticipantContext,
  getFacilitationThreadId,
} from "./exedra-facilitation-client.ts";

export async function runFacilitationEventWorkflow(
  params: FacilitationWorkflowParams,
): Promise<void> {
  const context = await fetchParticipantContext(params.sessionId, params.participantUserId);
  const output = await runFacilitationEvent({
    registry: { register: async () => {}, get: async () => null } as never,
    model: resolveFacilitationModel(),
    context: {
      sessionTopic: context.sessionTopic,
      participantName: context.participantName,
      messages: context.messages,
      beliefs: context.beliefs,
    },
    event: params.event,
  });

  const facilitationThreadId = await getFacilitationThreadId(params.sessionId);
  await appendFacilitationMessage({
    threadId: facilitationThreadId,
    jobId: params.jobId,
    assistantId: output.assistantId ?? nanoid(),
    parts: output.parts,
  });
}
