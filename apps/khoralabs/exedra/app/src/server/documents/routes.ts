import { requireRegistrySessionResponse } from "../auth/require-session.js";
import { canContributeToSessionKg, canReadSessionKg } from "../authz/policy.js";
import { getDb } from "../db/index.js";
import { getSession } from "../db/sessions.js";
import { getOrCreateUser } from "../identity/users.js";
import { acceptDocument, resolveSessionOrgId, resolveSessionTargetNamespace } from "./accept.js";
import {
  getDocumentsS3Bucket,
  isAllowedDocumentMimeType,
  MAX_DOCUMENT_BYTE_SIZE,
  sanitizeDocumentFileName,
} from "./config.js";
import { getDocumentById, listDocumentsBySession } from "./db.js";
import { documentMatchesGrantResource, resolveSessionUploadGrantResource } from "./grant-scope.js";
import { ExedraDocumentStore } from "./s3-store.js";

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function documentsUnavailableResponse(): Response {
  return jsonResponse({ error: "Document storage is not configured" }, 503);
}

async function requireSessionDocumentReadAccess(
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
  if (!(await canReadSessionKg(user.id, sessionId))) {
    return { ok: false, response: jsonResponse({ error: "Forbidden" }, 403) };
  }

  return { ok: true, userId: user.id, session };
}

async function requireSessionDocumentContributeAccess(
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
  if (!(await canContributeToSessionKg(user.id, sessionId))) {
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

  const access = await requireSessionDocumentContributeAccess(req, sessionId);
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
  const orgId = await resolveSessionOrgId(db, access.session.teamId);
  const batchId = crypto.randomUUID();
  const targetNamespace = resolveSessionTargetNamespace(
    access.userId,
    orgId,
    access.session.teamId,
    sessionId,
  );

  try {
    const result = await acceptDocument({
      db,
      orgId,
      batchId,
      targetNamespace,
      grantResource: resolveSessionUploadGrantResource(sessionId),
      teamId: access.session.teamId,
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
          batchId: result.document.batchId,
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
  const access = await requireSessionDocumentReadAccess(req, sessionId);
  if (!access.ok) return access.response;

  const documents = listDocumentsBySession(getDb(), sessionId).map((document) => ({
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    memoryKey: document.memoryKey,
    status: document.status,
    summary: document.summary,
    contentHash: document.contentHash,
    batchId: document.batchId,
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

  const access = await requireSessionDocumentReadAccess(req, sessionId);
  if (!access.ok) return access.response;

  const document = getDocumentById(getDb(), documentId);
  const sessionGrant = resolveSessionUploadGrantResource(sessionId);
  if (document === null || !documentMatchesGrantResource(document, sessionGrant)) {
    return jsonResponse({ error: "Document not found" }, 404);
  }

  try {
    const store = new ExedraDocumentStore();
    const resolved = await store.getByS3Key({
      s3Key: document.s3Key,
      contentHash: document.contentHash,
      mimeType: document.mimeType,
    });
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
