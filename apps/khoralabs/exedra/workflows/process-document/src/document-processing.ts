/** JSON-serializable params passed from Exedra to the processDocument workflow task. */
export type ProcessDocumentParams = {
  documentId: string;
  userId: string;
  batchId: string;
  teamId: string;
  orgId: string;
  namespace: string;
};

export type DocumentProcessingStatus = "accepted" | "processing" | "ready" | "failed";

export type InternalDocumentWire = {
  id: string;
  batchId: string;
  targetNamespace: string;
  grantResourceType: string;
  grantResourceId: string;
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
  processedAtMs: number | null;
  createdAtMs: number;
};

export type InternalDocumentPatchRequest = {
  status?: DocumentProcessingStatus;
  summary?: string | null;
  errorMessage?: string | null;
  taskRunId?: string | null;
  processedAtMs?: number | null;
};

export type InternalDocumentBatchWire = {
  batchId: string;
  targetNamespace: string;
  grantResourceType: string;
  grantResourceId: string;
  orgId: string | null;
  teamId: string | null;
  uploadedByUserId: string;
  contextText: string;
  status: DocumentProcessingStatus;
  documents: InternalDocumentWire[];
};

/** Params for integrateDocument workflow task (one text chunk or whole binary doc). */
export type DocumentIntegrationParams = {
  userId: string;
  batchId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  chunkText: string;
  namespace: string;
  orgId?: string;
  contextText?: string;
  siblingSummaries?: Array<{ documentId: string; fileName: string; excerpt: string }>;
  /** Omitted for binary whole-document integration. */
  chunkIndex?: number;
};

export type BatchIntegrationParams = {
  batchId: string;
  userId: string;
  namespace: string;
  orgId?: string;
  teamId?: string;
  sessionId?: string | null;
  /** User message or contribution context text. */
  contextText?: string;
};

export type InternalMemoriesMergeDocumentChunkRequest = {
  userId: string;
  memoryKey: string;
  namespace?: string;
  orgId?: string;
  plaintext: string;
  content: Array<{ key: string; text?: string; vector: number[] }>;
  properties?: Record<string, unknown>;
};

export type InternalMemoriesMergeDocumentChunkResponse = {
  memoryKey: string;
  namespace: string;
};

export const CONTEXT_DOCUMENT_FILE_NAME = "context.txt";

export function isContextDocument(fileName: string, mimeType: string): boolean {
  return fileName === CONTEXT_DOCUMENT_FILE_NAME && mimeType.startsWith("text/");
}

export function resolveDocumentMemoryKey(
  batchId: string,
  documentId: string,
  chunkIndex?: number,
): string {
  if (chunkIndex === undefined) {
    return `documents/${batchId}/${documentId}`;
  }
  return `documents/${batchId}/${documentId}/chunk/${chunkIndex}`;
}

export function deriveBatchStatus(
  documents: readonly { status: DocumentProcessingStatus }[],
): DocumentProcessingStatus {
  if (documents.length === 0) return "accepted";
  if (documents.some((document) => document.status === "failed")) return "failed";
  if (documents.every((document) => document.status === "ready")) return "ready";
  if (documents.some((document) => document.status === "processing")) return "processing";
  return "accepted";
}
