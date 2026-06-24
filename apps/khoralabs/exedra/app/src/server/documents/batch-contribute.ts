import type { Database } from "bun:sqlite";
import {
  CONTEXT_DOCUMENT_FILE_NAME,
  deriveBatchStatus,
  isContextDocument,
} from "@khoralabs/exedra-workflows-process-document/document-processing";
import { ResourceType } from "../authz/policy.js";
import { acceptDocument } from "./accept.js";
import {
  getDocumentsS3Bucket,
  isAllowedDocumentMimeType,
  MAX_DOCUMENT_BYTE_SIZE,
  sanitizeDocumentFileName,
} from "./config.js";
import { listDocumentsByBatch } from "./db.js";
import { dispatchBatchIntegrationForDocuments } from "./dispatch-batch-integration.js";
import {
  resolveContributionGrantResource,
  userCanContributeViaGrant,
  userCanViewDocumentsForGrant,
} from "./grant-scope.js";
import type { DocumentGrantResource, DocumentRecord } from "./types.js";

const MAX_BATCH_FILES = 10;

function toDocumentWire(document: DocumentRecord) {
  return {
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    memoryKey: document.memoryKey,
    status: document.status,
    summary: document.summary,
    contentHash: document.contentHash,
    targetNamespace: document.targetNamespace,
    grantResource: {
      type: document.grantResourceType,
      id: document.grantResourceId,
    },
    errorMessage: document.errorMessage,
    processedAtMs: document.processedAtMs,
    createdAtMs: document.createdAtMs,
  };
}

export function readContextTextFromBatch(documents: readonly DocumentRecord[]): string {
  const contextDocument = documents.find((document) =>
    isContextDocument(document.fileName, document.mimeType),
  );
  return contextDocument?.summary ?? "";
}

export async function acceptContributionBatch(args: {
  db: Database;
  userId: string;
  batchId: string;
  targetNamespace: string;
  grantResource: DocumentGrantResource;
  orgId: string | null;
  teamId: string | null;
  files: File[];
  contextText?: string;
}): Promise<{ batchId: string; documents: DocumentRecord[] }> {
  const orgId = args.orgId ?? "personal";
  const documents: DocumentRecord[] = [];

  for (const file of args.files) {
    if (file.size === 0) continue;
    if (file.size > MAX_DOCUMENT_BYTE_SIZE) {
      throw new Error("File too large");
    }
    const mimeType = (file.type || "application/octet-stream").trim();
    if (!isAllowedDocumentMimeType(mimeType)) {
      throw new Error("Unsupported file type");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await acceptDocument({
      db: args.db,
      orgId,
      batchId: args.batchId,
      targetNamespace: args.targetNamespace,
      grantResource: args.grantResource,
      teamId: args.teamId,
      userId: args.userId,
      fileName: sanitizeDocumentFileName(file.name || "upload"),
      mimeType,
      bytes,
    });
    documents.push(result.document);
  }

  const trimmedContext = args.contextText?.trim() ?? "";
  if (trimmedContext.length > 0) {
    const bytes = new TextEncoder().encode(trimmedContext);
    const result = await acceptDocument({
      db: args.db,
      orgId,
      batchId: args.batchId,
      targetNamespace: args.targetNamespace,
      grantResource: args.grantResource,
      teamId: args.teamId,
      userId: args.userId,
      fileName: CONTEXT_DOCUMENT_FILE_NAME,
      mimeType: "text/plain",
      bytes,
    });
    documents.push(result.document);
  }

  if (documents.length === 0) {
    throw new Error("At least one file or context text is required");
  }

  return { batchId: args.batchId, documents };
}

export function buildBatchWire(db: Database, batchId: string) {
  const documents = listDocumentsByBatch(db, batchId);
  if (documents.length === 0) return null;
  const first = documents[0];
  if (first === undefined) return null;
  return {
    batchId,
    targetNamespace: first.targetNamespace,
    grantResource: {
      type: first.grantResourceType,
      id: first.grantResourceId,
    },
    orgId: first.orgId,
    teamId: first.teamId,
    uploadedByUserId: first.uploadedByUserId,
    contextText: readContextTextFromBatch(documents),
    status: deriveBatchStatus(documents),
    documents: documents.map(toDocumentWire),
  };
}

export async function dispatchAcceptedBatch(args: {
  db: Database;
  batchId: string;
  userId: string;
}): Promise<void> {
  const documents = listDocumentsByBatch(args.db, args.batchId);
  const first = documents[0];
  if (first === undefined) return;

  void dispatchBatchIntegrationForDocuments({
    db: args.db,
    batchId: args.batchId,
    params: {
      batchId: args.batchId,
      userId: args.userId,
      namespace: first.targetNamespace,
      ...(first.orgId !== null ? { orgId: first.orgId } : {}),
      ...(first.teamId !== null ? { teamId: first.teamId } : {}),
      ...(first.grantResourceType === ResourceType.Session
        ? { sessionId: first.grantResourceId }
        : {}),
    },
  });
}

export {
  getDocumentsS3Bucket,
  MAX_BATCH_FILES,
  resolveContributionGrantResource,
  toDocumentWire,
  userCanContributeViaGrant,
  userCanViewDocumentsForGrant,
};
