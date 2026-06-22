import { MemoryAdapterClient } from "@khoralabs/memories-adapter";
import type { ExpandedMemoryDraftWire } from "../../../shared/belief-integration.ts";
import { exedraDocumentAdapterInstructions } from "../../../shared/document-agent-instructions.ts";
import type { DocumentIntegrationParams } from "../../../shared/document-processing.ts";
import {
  createRemoteMemoriesClient,
  getAgentRegistry,
  resolveAdapterMaxSteps,
  resolveChatModel,
  resolveEmbeddingModel,
} from "./agent-runtime.ts";
import { createWorkflowMemoriesAgentTelemetry } from "./agent-telemetry.ts";

export async function expandDocument(
  args: DocumentIntegrationParams & { namespace: string },
): Promise<ExpandedMemoryDraftWire> {
  const client = createRemoteMemoriesClient(args.userId);
  const adapter = new MemoryAdapterClient({
    registry: getAgentRegistry(),
    namespace: args.namespace,
    model: resolveChatModel(),
    client,
    embeddingModel: resolveEmbeddingModel(),
    instructions: exedraDocumentAdapterInstructions,
  });
  const telemetry = await createWorkflowMemoriesAgentTelemetry(client);

  const { draft } = await adapter.expand({
    ingest: {
      sourceApp: "exedra",
      userId: args.userId,
      correlationId: args.documentId,
    },
    domainPayload: {
      documentText: args.chunkText,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sessionId: args.sessionId,
      documentId: args.documentId,
      ...(args.chunkIndex !== undefined ? { chunkIndex: args.chunkIndex } : {}),
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
