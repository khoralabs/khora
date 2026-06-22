import { MemoriesClient } from "@khoralabs/memories-core";
import type {
  InternalDocumentPatchRequest,
  InternalDocumentWire,
} from "../../../../shared/document-processing.js";
import { resolveDocumentMemoryKey } from "../../../../shared/document-processing.js";
import { getDb } from "../db/index.js";
import { getTeam } from "../db/membership.js";
import { getSessionDocumentById, patchSessionDocument } from "../documents/db.js";
import { buildExedraDocumentRef, ExedraDocumentStore } from "../documents/s3-store.js";
import { logger } from "../logger.js";
import { exedraMemoriesOntology } from "../memories/exedra-ontology.js";
import { userScope } from "../memories/namespaces.js";
import { openUserMemories } from "../memories/store.js";
import { withSpan } from "../telemetry/spans.js";
import { requireInternalToken } from "./require-internal-token.js";

function toInternalDocumentWire(
  record: NonNullable<ReturnType<typeof getSessionDocumentById>>,
): InternalDocumentWire {
  return {
    id: record.id,
    sessionId: record.sessionId,
    uploadedByUserId: record.uploadedByUserId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    contentHash: record.contentHash,
    s3Key: record.s3Key,
    memoryKey: record.memoryKey,
    summary: record.summary,
    status: record.status,
    errorMessage: record.errorMessage,
    taskRunId: record.taskRunId,
    turnId: record.turnId,
    processedAtMs: record.processedAtMs,
    createdAtMs: record.createdAtMs,
  };
}

export async function handleInternalGetDocument(
  req: Request,
  documentId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const record = getSessionDocumentById(getDb(), documentId);
  if (record === null) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  return Response.json({ document: toInternalDocumentWire(record) });
}

export async function handleInternalGetDocumentBytes(
  req: Request,
  documentId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const db = getDb();
  const record = getSessionDocumentById(db, documentId);
  if (record === null) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  const sessionRow = db
    .query<{ team_id: string }, [string]>(`SELECT team_id FROM sessions WHERE id = ? LIMIT 1`)
    .get(record.sessionId);
  if (sessionRow === null) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  const teamRecord = getTeam(db, sessionRow.team_id);
  if (teamRecord === null) {
    return Response.json({ error: "Team not found" }, { status: 404 });
  }

  const ref = buildExedraDocumentRef({
    orgId: teamRecord.orgId,
    sessionId: record.sessionId,
    documentId: record.id,
    fileName: record.fileName,
    contentHash: record.contentHash,
  });

  try {
    const store = new ExedraDocumentStore();
    const resolved = await store.resolve(ref);
    if (resolved.kind !== "blob") {
      return Response.json({ error: "Document bytes unavailable" }, { status: 500 });
    }
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

  const updated = patchSessionDocument(getDb(), documentId, {
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.summary !== undefined ? { summary: body.summary } : {}),
    ...(body.errorMessage !== undefined ? { errorMessage: body.errorMessage } : {}),
    ...(body.taskRunId !== undefined ? { taskRunId: body.taskRunId } : {}),
    ...(body.turnId !== undefined ? { turnId: body.turnId } : {}),
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

  let body: { userId?: string; sessionId?: string; chunkCount?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim() ?? "";
  const sessionId = body.sessionId?.trim() ?? "";
  if (userId.length === 0 || sessionId.length === 0) {
    return Response.json({ error: "userId and sessionId are required" }, { status: 400 });
  }

  try {
    await withSpan(
      "internal.documents.delete_memories",
      { "document.id": documentId },
      async () => {
        const client = new MemoriesClient(openUserMemories(userId), exedraMemoriesOntology);
        const namespace = userScope(userId);
        const keys = [resolveDocumentMemoryKey(sessionId, documentId)];
        const chunkCount = body.chunkCount ?? 0;
        for (let index = 0; index < chunkCount; index++) {
          keys.push(resolveDocumentMemoryKey(sessionId, documentId, index));
        }
        for (const key of keys) {
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
