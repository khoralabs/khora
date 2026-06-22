import type { ContentAddressedRef } from "@khoralabs/sourcemaps";

import type { DocumentProcessingStatus } from "../../../../shared/document-processing.js";

export type ExedraDocumentLocators = {
  domain: "exedra_document";
  org_id: string;
  session_id: string;
  document_id: string;
  file_name: string;
};

export type ExedraDocumentRef = ContentAddressedRef<ExedraDocumentLocators>;

export type SessionDocumentRecord = {
  id: string;
  sessionId: string;
  uploadedByUserId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  s3Key: string;
  memoryKey: string;
  summary: string;
  status: DocumentProcessingStatus;
  errorMessage: string | null;
  taskRunId: string | null;
  turnId: string | null;
  processedAtMs: number | null;
  createdAtMs: number;
};

export type SessionDocumentWireRef = {
  id: string;
  fileName: string;
  memoryKey: string;
  status: DocumentProcessingStatus;
  sourceRef: ExedraDocumentRef;
};
