import { MemoryAdapterClient } from "@khoralabs/memories-adapter";
import {
  createRemoteMemoriesClient,
  getAgentRegistry,
  resolveAdapterMaxSteps,
  resolveChatModel,
  resolveEmbeddingModel,
} from "./agent-runtime.ts";
import { createWorkflowMemoriesAgentTelemetry } from "./agent-telemetry.ts";
import { exedraBeliefAdapterInstructions } from "./belief-instructions.ts";
import type { ExpandedMemoryDraftWire } from "./belief-integration.ts";

export async function expandBelief(args: {
  beliefText: string;
  feedback: "confirmed" | "corrected";
  sessionId: string;
  beliefId: string;
  userId: string;
  namespace: string;
}): Promise<ExpandedMemoryDraftWire> {
  const client = createRemoteMemoriesClient(args.userId);
  const adapter = new MemoryAdapterClient({
    registry: getAgentRegistry(),
    namespace: args.namespace,
    model: resolveChatModel(),
    client,
    embeddingModel: resolveEmbeddingModel(),
    instructions: exedraBeliefAdapterInstructions,
  });
  const telemetry = await createWorkflowMemoriesAgentTelemetry(client);

  const { draft } = await adapter.expand({
    ingest: {
      sourceApp: "exedra",
      userId: args.userId,
      correlationId: args.beliefId,
    },
    domainPayload: {
      belief: args.beliefText,
      feedback: args.feedback,
      sessionId: args.sessionId,
      beliefId: args.beliefId,
    },
    maxSteps: resolveAdapterMaxSteps(),
    telemetry,
  });

  return {
    plaintext: draft.plaintext,
    ...(draft.nodeLabelHints !== undefined ? { nodeLabelHints: draft.nodeLabelHints } : {}),
    ...(draft.edgeLabelHints !== undefined ? { edgeLabelHints: draft.edgeLabelHints } : {}),
  };
}
