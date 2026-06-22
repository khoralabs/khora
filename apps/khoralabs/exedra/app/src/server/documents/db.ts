import type { Database } from "bun:sqlite";
import type { DocumentProcessingStatus } from "../../../../shared/document-processing.js";
import { ResourceType } from "../authz/policy.js";
import type { DocumentGrantResource, DocumentRecord } from "./types.js";

type DocumentRow = {
  id: string;
  batch_id: string;
  target_namespace: string;
  grant_resource_type: string;
  grant_resource_id: string;
  org_id: string | null;
  team_id: string | null;
  uploaded_by_user_id: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  content_hash: string;
  s3_key: string;
  memory_key: string;
  summary: string | null;
  status: string;
  error_message: string | null;
  task_run_id: string | null;
  processed_at_ms: number | null;
  created_at_ms: number;
};

function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    targetNamespace: row.target_namespace,
    grantResourceType: row.grant_resource_type,
    grantResourceId: row.grant_resource_id,
    orgId: row.org_id,
    teamId: row.team_id,
    uploadedByUserId: row.uploaded_by_user_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    contentHash: row.content_hash,
    s3Key: row.s3_key,
    memoryKey: row.memory_key,
    summary: row.summary ?? "",
    status: row.status as DocumentProcessingStatus,
    errorMessage: row.error_message,
    taskRunId: row.task_run_id,
    processedAtMs: row.processed_at_ms,
    createdAtMs: row.created_at_ms,
  };
}

export function insertDocument(
  db: Database,
  params: {
    id: string;
    batchId: string;
    targetNamespace: string;
    grantResource: DocumentGrantResource;
    orgId?: string | null;
    teamId?: string | null;
    uploadedByUserId: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    contentHash: string;
    s3Key: string;
    memoryKey: string;
    summary?: string;
    status?: DocumentProcessingStatus;
  },
): DocumentRecord {
  const createdAtMs = Date.now();
  const status = params.status ?? "accepted";
  const summary = params.summary ?? "";
  db.prepare(
    `INSERT INTO documents (
       id, batch_id, target_namespace, grant_resource_type, grant_resource_id,
       org_id, team_id,
       uploaded_by_user_id, file_name, mime_type, byte_size, content_hash,
       s3_key, memory_key, summary, status, error_message, task_run_id,
       processed_at_ms, created_at_ms
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
  ).run(
    params.id,
    params.batchId,
    params.targetNamespace,
    params.grantResource.type,
    params.grantResource.id,
    params.orgId ?? null,
    params.teamId ?? null,
    params.uploadedByUserId,
    params.fileName,
    params.mimeType,
    params.byteSize,
    params.contentHash,
    params.s3Key,
    params.memoryKey,
    summary,
    status,
    createdAtMs,
  );

  const row = db
    .query<DocumentRow, [string]>(`SELECT * FROM documents WHERE id = ? LIMIT 1`)
    .get(params.id);
  if (row === null) throw new Error("document insert failed");
  return mapDocument(row);
}

export function getDocumentById(db: Database, documentId: string): DocumentRecord | null {
  const row = db
    .query<DocumentRow, [string]>(`SELECT * FROM documents WHERE id = ? LIMIT 1`)
    .get(documentId);
  return row === null ? null : mapDocument(row);
}

export function listDocumentsByGrantResource(
  db: Database,
  grantResource: DocumentGrantResource,
): DocumentRecord[] {
  const rows = db
    .query<DocumentRow, [string, string]>(
      `SELECT * FROM documents
       WHERE grant_resource_type = ? AND grant_resource_id = ?
       ORDER BY created_at_ms DESC`,
    )
    .all(grantResource.type, grantResource.id);
  return rows.map(mapDocument);
}

export function listDocumentsBySession(db: Database, sessionId: string): DocumentRecord[] {
  return listDocumentsByGrantResource(db, { type: ResourceType.Session, id: sessionId });
}

export function listDocumentsByBatch(db: Database, batchId: string): DocumentRecord[] {
  const rows = db
    .query<DocumentRow, [string]>(
      `SELECT * FROM documents WHERE batch_id = ? ORDER BY created_at_ms ASC`,
    )
    .all(batchId);
  return rows.map(mapDocument);
}

export function getDocumentsForUser(
  db: Database,
  sessionId: string,
  userId: string,
  documentIds: readonly string[],
): DocumentRecord[] {
  if (documentIds.length === 0) return [];
  const placeholders = documentIds.map(() => "?").join(", ");
  const rows = db
    .query<DocumentRow, string[]>(
      `SELECT * FROM documents
       WHERE grant_resource_type = ?
         AND grant_resource_id = ?
         AND uploaded_by_user_id = ?
         AND id IN (${placeholders})`,
    )
    .all(ResourceType.Session, sessionId, userId, ...documentIds);
  return rows.map(mapDocument);
}

export function patchDocument(
  db: Database,
  documentId: string,
  patch: {
    batchId?: string;
    status?: DocumentProcessingStatus;
    summary?: string | null;
    errorMessage?: string | null;
    taskRunId?: string | null;
    processedAtMs?: number | null;
  },
): DocumentRecord | null {
  const current = getDocumentById(db, documentId);
  if (current === null) return null;

  const next = {
    batchId: patch.batchId ?? current.batchId,
    status: patch.status ?? current.status,
    summary: patch.summary !== undefined ? patch.summary : current.summary,
    errorMessage: patch.errorMessage !== undefined ? patch.errorMessage : current.errorMessage,
    taskRunId: patch.taskRunId !== undefined ? patch.taskRunId : current.taskRunId,
    processedAtMs: patch.processedAtMs !== undefined ? patch.processedAtMs : current.processedAtMs,
  };

  db.prepare(
    `UPDATE documents
     SET batch_id = ?, status = ?, summary = ?, error_message = ?, task_run_id = ?, processed_at_ms = ?
     WHERE id = ?`,
  ).run(
    next.batchId,
    next.status,
    next.summary,
    next.errorMessage,
    next.taskRunId,
    next.processedAtMs,
    documentId,
  );

  return getDocumentById(db, documentId);
}

export function patchDocumentsBatchId(
  db: Database,
  documentIds: readonly string[],
  batchId: string,
): void {
  if (documentIds.length === 0) return;
  const placeholders = documentIds.map(() => "?").join(", ");
  db.prepare(`UPDATE documents SET batch_id = ? WHERE id IN (${placeholders})`).run(
    batchId,
    ...documentIds,
  );
}

export function deleteDocument(db: Database, documentId: string): void {
  db.prepare(`DELETE FROM documents WHERE id = ?`).run(documentId);
}
