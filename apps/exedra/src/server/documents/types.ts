import type { ContentAddressedRef } from "@khoralabs/sourcemaps";

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
  createdAtMs: number;
};

export type SessionDocumentWireRef = {
  id: string;
  fileName: string;
  memoryKey: string;
  sourceRef: ExedraDocumentRef;
};
