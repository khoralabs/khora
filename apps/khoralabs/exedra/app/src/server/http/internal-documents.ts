import { MemoriesClient } from "@khoralabs/memories-core";
import type {
  InternalDocumentBatchWire,
  InternalDocumentPatchRequest,
  InternalDocumentWire,
} from "../../../../shared/document-processing.js";
import {
  deriveBatchStatus,
  isContextDocument,
  resolveDocumentMemoryKey,
} from "../../../../shared/document-processing.js";
import { getDb } from "../db/index.js";
import { readContextTextFromBatch } from "../documents/batch-contribute.js";
import { getDocumentById, listDocumentsByBatch, patchDocument } from "../documents/db.js";
import { resolveDocumentOrgId } from "../documents/grant-scope.js";
import { ExedraDocumentStore } from "../documents/s3-store.js";
import type { DocumentRecord } from "../documents/types.js";
import { logger } from "../logger.js";
import { exedraMemoriesOntology } from "../memories/exedra-ontology.js";
import { openOrgMemories, openUserMemories } from "../memories/store.js";
import { withSpan } from "../telemetry/spans.js";
import { requireInternalToken } from "./require-internal-token.js";

function toInternalDocumentWire(document: DocumentRecord): InternalDocumentWire {
  return {
    id: document.id,
    batchId: document.batchId,
    targetNamespace: document.targetNamespace,
    grantResourceType: document.grantResourceType,
    grantResourceId: document.grantResourceId,
    uploadedByUserId: document.uploadedByUserId,
    fileName: document.fileName,
    mimeType: document.mimeType,
    byteSize: document.byteSize,
    contentHash: document.contentHash,
    s3Key: document.s3Key,
    memoryKey: document.memoryKey,
    summary: document.summary,
    status: document.status,
    errorMessage: document.errorMessage,
    taskRunId: document.taskRunId,
    processedAtMs: document.processedAtMs,
    createdAtMs: document.createdAtMs,
  };
}

function toInternalBatchWire(
  db: ReturnType<typeof getDb>,
  batchId: string,
): InternalDocumentBatchWire | null {
  const documents = listDocumentsByBatch(db, batchId);
  if (documents.length === 0) return null;
  const first = documents[0];
  if (first === undefined) return null;
  return {
    batchId,
    targetNamespace: first.targetNamespace,
    grantResourceType: first.grantResourceType,
    grantResourceId: first.grantResourceId,
    orgId: first.orgId,
    teamId: first.teamId,
    uploadedByUserId: first.uploadedByUserId,
    contextText: readContextTextFromBatch(documents),
    status: deriveBatchStatus(documents),
    documents: documents.map(toInternalDocumentWire),
  };
}

export async function handleInternalGetDocument(
  req: Request,
  documentId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const record = getDocumentById(getDb(), documentId);
  if (record === null) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  return Response.json({ document: toInternalDocumentWire(record) });
}

export async function handleInternalGetDocumentBatch(
  req: Request,
  batchId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const batch = toInternalBatchWire(getDb(), batchId);
  if (batch === null) {
    return Response.json({ error: "Batch not found" }, { status: 404 });
  }

  return Response.json({ batch });
}

export async function handleInternalGetDocumentBytes(
  req: Request,
  documentId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const db = getDb();
  const record = getDocumentById(db, documentId);
  if (record === null) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  const orgId = resolveDocumentOrgId(db, record);
  if (orgId === null) {
    return Response.json({ error: "Org not found" }, { status: 404 });
  }

  try {
    const store = new ExedraDocumentStore();
    const resolved = await store.getByS3Key({
      s3Key: record.s3Key,
      contentHash: record.contentHash,
      mimeType: record.mimeType,
    });
    const bytes = new Uint8Array(await resolved.blob.arrayBuffer());
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": record.mimeType,
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Document download failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function handleInternalPatchDocument(
  req: Request,
  documentId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: InternalDocumentPatchRequest;
  try {
    body = (await req.json()) as InternalDocumentPatchRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updated = patchDocument(getDb(), documentId, {
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.summary !== undefined ? { summary: body.summary } : {}),
    ...(body.errorMessage !== undefined ? { errorMessage: body.errorMessage } : {}),
    ...(body.taskRunId !== undefined ? { taskRunId: body.taskRunId } : {}),
    ...(body.processedAtMs !== undefined ? { processedAtMs: body.processedAtMs } : {}),
  });

  if (updated === null) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  return Response.json({ document: toInternalDocumentWire(updated) });
}

export async function handleInternalDeleteDocumentMemories(
  req: Request,
  documentId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: { userId?: string; batchId?: string; chunkCount?: number; orgId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim() ?? "";
  const batchId = body.batchId?.trim() ?? "";
  if (userId.length === 0 || batchId.length === 0) {
    return Response.json({ error: "userId and batchId are required" }, { status: 400 });
  }

  const db = getDb();
  const document = getDocumentById(db, documentId);
  const orgId =
    body.orgId?.trim() || (document !== null ? resolveDocumentOrgId(getDb(), document) : null);

  try {
    await withSpan(
      "internal.documents.delete_memories",
      { "document.id": documentId },
      async () => {
        const persistence =
          orgId !== null && orgId.length > 0 ? openOrgMemories(orgId) : openUserMemories(userId);
        const client = new MemoriesClient(persistence, exedraMemoriesOntology);
        const namespace = document?.targetNamespace ?? "";
        const keys = [resolveDocumentMemoryKey(batchId, documentId)];
        const chunkCount = body.chunkCount ?? 0;
        for (let index = 0; index < chunkCount; index++) {
          keys.push(resolveDocumentMemoryKey(batchId, documentId, index));
        }
        for (const key of keys) {
          if (namespace.length === 0) continue;
          client.deleteMemory({ namespace, key });
        }
      },
    );
    return Response.json({ ok: true });
  } catch (err) {
    logger.error({ err, documentId }, "internal document memory cleanup failed");
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export { isContextDocument };
