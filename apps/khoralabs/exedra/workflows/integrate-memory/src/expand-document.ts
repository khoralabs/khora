import { exedraDocumentAdapterInstructions } from "@khoralabs/exedra-workflows-process-document/document-agent-instructions";
import type { DocumentIntegrationParams } from "@khoralabs/exedra-workflows-process-document/document-processing";
import { MemoryAdapterClient } from "@khoralabs/memories-adapter";
import {
  createRemoteMemoriesClient,
  getAgentRegistry,
  resolveAdapterMaxSteps,
  resolveChatModel,
  resolveEmbeddingModel,
} from "./agent-runtime.ts";
import { createWorkflowMemoriesAgentTelemetry } from "./agent-telemetry.ts";
import type { ExpandedMemoryDraftWire } from "./belief-integration.ts";

export async function expandDocument(
  args: DocumentIntegrationParams & { namespace: string },
): Promise<ExpandedMemoryDraftWire> {
  const client = await createRemoteMemoriesClient(args.userId);
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
      batchId: args.batchId,
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
