import { requireRegistrySessionResponse } from "../auth/require-session.js";
import { getDb } from "../db/index.js";
import { getOrCreateUser } from "../identity/users.js";
import { namespaceMatchesGrantResource } from "../memories/access.js";
import {
  acceptContributionBatch,
  buildBatchWire,
  dispatchAcceptedBatch,
  MAX_BATCH_FILES,
  resolveContributionGrantResource,
  userCanContributeViaGrant,
  userCanViewDocumentsForGrant,
} from "./batch-contribute.js";
import { getDocumentsS3Bucket } from "./config.js";
import { listDocumentsByBatch } from "./db.js";
import type { DocumentGrantResource } from "./types.js";

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function documentsUnavailableResponse(): Response {
  return jsonResponse({ error: "Document storage is not configured" }, 503);
}

export async function handleContributeDocuments(req: Request): Promise<Response> {
  if (getDocumentsS3Bucket() === undefined) {
    return documentsUnavailableResponse();
  }

  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "Invalid multipart form data" }, 400);
  }

  const namespace = (formData.get("namespace")?.toString() ?? "").trim();
  if (namespace.length === 0) {
    return jsonResponse({ error: "namespace is required" }, 400);
  }

  const orgIdRaw = (formData.get("orgId")?.toString() ?? "").trim();
  const teamIdRaw = (formData.get("teamId")?.toString() ?? "").trim();
  const sessionIdRaw = (formData.get("sessionId")?.toString() ?? "").trim();
  const orgId = orgIdRaw.length > 0 ? orgIdRaw : null;
  const teamId = teamIdRaw.length > 0 ? teamIdRaw : null;
  const sessionId = sessionIdRaw.length > 0 ? sessionIdRaw : null;
  const contextText = formData.get("contextText")?.toString() ?? "";

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > MAX_BATCH_FILES) {
    return jsonResponse({ error: `Maximum ${MAX_BATCH_FILES} files per contribution` }, 413);
  }

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);

  let grantResource: DocumentGrantResource;
  try {
    grantResource = resolveContributionGrantResource({
      userId: user.id,
      targetNamespace: namespace,
      sessionId,
      teamId,
      orgId,
    });
  } catch {
    return jsonResponse({ error: "Could not resolve knowledge scope" }, 400);
  }

  if (!userCanContributeViaGrant(db, user.id, grantResource)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  if (
    !namespaceMatchesGrantResource(namespace, grantResource, {
      orgId: orgId ?? undefined,
      userId: user.id,
    })
  ) {
    return jsonResponse({ error: "Namespace does not match knowledge scope" }, 400);
  }

  const batchId = crypto.randomUUID();

  try {
    const result = await acceptContributionBatch({
      db,
      userId: user.id,
      batchId,
      targetNamespace: namespace,
      grantResource,
      orgId,
      teamId,
      files,
      contextText,
    });

    void dispatchAcceptedBatch({ db, batchId: result.batchId, userId: user.id });

    const batch = buildBatchWire(db, result.batchId);
    return jsonResponse({ batch }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Document contribution failed";
    return jsonResponse({ error: message }, 500);
  }
}

export async function handleGetDocumentBatch(req: Request, batchId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);
  const batch = buildBatchWire(db, batchId);
  if (batch === null) {
    return jsonResponse({ error: "Batch not found" }, 404);
  }

  const documents = listDocumentsByBatch(db, batchId);
  const ownsBatch = documents.some((document) => document.uploadedByUserId === user.id);
  if (
    !ownsBatch &&
    !userCanViewDocumentsForGrant(db, user.id, {
      type: batch.grantResource.type,
      id: batch.grantResource.id,
    })
  ) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return jsonResponse({ batch });
}
