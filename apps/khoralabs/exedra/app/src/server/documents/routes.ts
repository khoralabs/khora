import { requireRegistrySessionResponse } from "../auth/require-session.js";
import { getDb } from "../db/index.js";
import { getSession, userHasSessionAccess } from "../db/sessions.js";
import { getOrCreateUser } from "../identity/users.js";
import {
  getDocumentsS3Bucket,
  isAllowedDocumentMimeType,
  MAX_DOCUMENT_BYTE_SIZE,
  sanitizeDocumentFileName,
} from "./config.js";
import { getSessionDocument, listSessionDocuments } from "./db.js";
import { acceptSessionDocument, resolveSessionOrgId } from "./ingest.js";
import { buildExedraDocumentRef, ExedraDocumentStore } from "./s3-store.js";

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function documentsUnavailableResponse(): Response {
  return jsonResponse({ error: "Document storage is not configured" }, 503);
}

async function requireSessionDocumentAccess(
  req: Request,
  sessionId: string,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; userId: string; session: NonNullable<ReturnType<typeof getSession>> }
> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return { ok: false, response: auth.response };

  const db = getDb();
  const session = getSession(db, sessionId);
  if (session === null) {
    return { ok: false, response: jsonResponse({ error: "Session not found" }, 404) };
  }

  const user = await getOrCreateUser(db, auth.session.user.id);
  if (!userHasSessionAccess(db, sessionId, user.id)) {
    return { ok: false, response: jsonResponse({ error: "Forbidden" }, 403) };
  }

  return { ok: true, userId: user.id, session };
}

export async function handleUploadSessionDocument(
  req: Request,
  sessionId: string,
): Promise<Response> {
  if (getDocumentsS3Bucket() === undefined) {
    return documentsUnavailableResponse();
  }

  const access = await requireSessionDocumentAccess(req, sessionId);
  if (!access.ok) return access.response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "Invalid multipart form data" }, 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonResponse({ error: "Missing file field" }, 400);
  }

  if (file.size === 0) {
    return jsonResponse({ error: "Empty file" }, 400);
  }
  if (file.size > MAX_DOCUMENT_BYTE_SIZE) {
    return jsonResponse({ error: "File too large" }, 413);
  }

  const mimeType = (file.type || "application/octet-stream").trim();
  if (!isAllowedDocumentMimeType(mimeType)) {
    return jsonResponse({ error: "Unsupported file type" }, 415);
  }

  const fileName = sanitizeDocumentFileName(file.name || "upload");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const db = getDb();
  const orgId = resolveSessionOrgId(db, access.session.teamId);

  try {
    const result = await acceptSessionDocument({
      db,
      orgId,
      sessionId,
      userId: access.userId,
      fileName,
      mimeType,
      bytes,
    });

    return jsonResponse(
      {
        document: {
          id: result.document.id,
          fileName: result.document.fileName,
          mimeType: result.document.mimeType,
          memoryKey: result.document.memoryKey,
          status: result.document.status,
          summary: result.document.summary,
          contentHash: result.document.contentHash,
          sourceRef: result.sourceRef,
        },
      },
      201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Document upload failed";
    return jsonResponse({ error: message }, 500);
  }
}

export async function handleListSessionDocuments(
  req: Request,
  sessionId: string,
): Promise<Response> {
  const access = await requireSessionDocumentAccess(req, sessionId);
  if (!access.ok) return access.response;

  const documents = listSessionDocuments(getDb(), sessionId).map((document) => ({
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    memoryKey: document.memoryKey,
    status: document.status,
    summary: document.summary,
    contentHash: document.contentHash,
    uploadedByUserId: document.uploadedByUserId,
    createdAtMs: document.createdAtMs,
  }));

  return jsonResponse({ documents });
}

export async function handleGetSessionDocument(
  req: Request,
  sessionId: string,
  documentId: string,
): Promise<Response> {
  if (getDocumentsS3Bucket() === undefined) {
    return documentsUnavailableResponse();
  }

  const access = await requireSessionDocumentAccess(req, sessionId);
  if (!access.ok) return access.response;

  const document = getSessionDocument(getDb(), sessionId, documentId);
  if (document === null) {
    return jsonResponse({ error: "Document not found" }, 404);
  }

  const orgId = resolveSessionOrgId(getDb(), access.session.teamId);
  const ref = buildExedraDocumentRef({
    orgId,
    sessionId,
    documentId: document.id,
    fileName: document.fileName,
    contentHash: document.contentHash,
  });

  try {
    const store = new ExedraDocumentStore();
    const resolved = await store.resolve(ref);
    if (resolved.kind !== "blob") {
      return jsonResponse({ error: "Document bytes unavailable" }, 500);
    }

    return new Response(resolved.blob, {
      status: 200,
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="${document.fileName.replace(/"/g, "")}"`,
        "Content-Length": String(document.byteSize),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Document download failed";
    return jsonResponse({ error: message }, 500);
  }
}
