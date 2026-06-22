import { runFacilitationEvent } from "@khoralabs/exedra-facilitation-agent";
import { nanoid } from "nanoid";
import type { FacilitationWorkflowParams } from "../../../../shared/facilitation-workflow.js";
import { createModel, getAgentRegistry } from "../../agents/index.js";
import type { getDb } from "../db/index.js";
import { getOrCreateFacilitationThread } from "../db/sessions.js";
import { appendFacilitationAssistantMessage } from "../facilitation/messages.js";
import { buildFacilitationParticipantContext } from "../http/internal-facilitation.js";
import { setJobStatus } from "../jobs/db.js";
import { createExedraAgentTelemetry } from "../telemetry/agent-telemetry.js";

export async function runFacilitationEventInProcess(
  db: ReturnType<typeof getDb>,
  params: FacilitationWorkflowParams,
): Promise<void> {
  const context = buildFacilitationParticipantContext(
    db,
    params.sessionId,
    params.participantUserId,
  );
  if (context === null) {
    setJobStatus(db, params.jobId, "failed", { error: "Participant context not found" });
    return;
  }

  const output = await runFacilitationEvent({
    registry: getAgentRegistry(),
    model: createModel(),
    createTelemetry: createExedraAgentTelemetry,
    context: {
      sessionTopic: context.sessionTopic,
      participantName: context.participantName,
      messages: context.messages,
      beliefs: context.beliefs,
    },
    event: params.event,
  });

  const facilitationThreadId = getOrCreateFacilitationThread(db, params.sessionId);
  appendFacilitationAssistantMessage(db, {
    facilitationThreadId,
    assistantId: output.assistantId ?? nanoid(),
    parts: output.parts,
  });

  setJobStatus(db, params.jobId, "done");
}
