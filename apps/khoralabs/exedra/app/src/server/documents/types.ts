import type { ContentAddressedRef } from "@khoralabs/sourcemaps";

import type { DocumentProcessingStatus } from "../../../../shared/document-processing.js";

export type DocumentGrantResource = {
  type: string;
  id: string;
};

export type ExedraDocumentLocators = {
  domain: "exedra_document";
  org_id: string;
  batch_id: string;
  document_id: string;
  file_name: string;
};

export type ExedraDocumentRef = ContentAddressedRef<ExedraDocumentLocators>;

export type DocumentRecord = {
  id: string;
  batchId: string;
  targetNamespace: string;
  grantResourceType: string;
  grantResourceId: string;
  orgId: string | null;
  teamId: string | null;
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
  processedAtMs: number | null;
  createdAtMs: number;
};

export type DocumentWireRef = {
  id: string;
  fileName: string;
  memoryKey: string;
  status: DocumentProcessingStatus;
  sourceRef: ExedraDocumentRef;
};

export type SessionDocumentWireRef = DocumentWireRef;
