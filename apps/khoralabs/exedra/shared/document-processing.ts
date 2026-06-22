/** JSON-serializable params passed from Exedra to the processDocument workflow task. */
export type ProcessDocumentParams = {
  documentId: string;
  userId: string;
  sessionId: string;
  teamId: string;
  orgId: string;
  turnId: string;
};

export type DocumentProcessingStatus = "accepted" | "processing" | "ready" | "failed";

export type InternalDocumentWire = {
  id: string;
  sessionId: string;
  uploadedByUserId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  s3Key: string;
  memoryKey: string;
  summary: string | null;
  status: DocumentProcessingStatus;
  errorMessage: string | null;
  taskRunId: string | null;
  turnId: string | null;
  processedAtMs: number | null;
  createdAtMs: number;
};

export type InternalDocumentPatchRequest = {
  status?: DocumentProcessingStatus;
  summary?: string | null;
  errorMessage?: string | null;
  taskRunId?: string | null;
  turnId?: string | null;
  processedAtMs?: number | null;
};

/** Params for integrateDocument workflow task (one text chunk or whole binary doc). */
export type DocumentIntegrationParams = {
  userId: string;
  sessionId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  chunkText: string;
  /** Omitted for binary whole-document integration. */
  chunkIndex?: number;
};

export type InternalMemoriesMergeDocumentChunkRequest = {
  userId: string;
  memoryKey: string;
  /** Optional; derived from userId when omitted. */
  namespace?: string;
  plaintext: string;
  content: Array<{ key: string; text?: string; vector: number[] }>;
  properties?: Record<string, unknown>;
};

export type InternalMemoriesMergeDocumentChunkResponse = {
  memoryKey: string;
  namespace: string;
};

export function resolveDocumentMemoryKey(
  sessionId: string,
  documentId: string,
  chunkIndex?: number,
): string {
  if (chunkIndex === undefined) {
    return `documents/${sessionId}/${documentId}`;
  }
  return `documents/${sessionId}/${documentId}/chunk/${chunkIndex}`;
}
