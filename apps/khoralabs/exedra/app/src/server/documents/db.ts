import type { Database } from "bun:sqlite";

import type { DocumentProcessingStatus } from "../../../../shared/document-processing.js";
import type { SessionDocumentRecord } from "./types.js";

type SessionDocumentRow = {
  id: string;
  session_id: string;
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
  turn_id: string | null;
  processed_at_ms: number | null;
  created_at_ms: number;
};

function mapSessionDocument(row: SessionDocumentRow): SessionDocumentRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
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
    turnId: row.turn_id,
    processedAtMs: row.processed_at_ms,
    createdAtMs: row.created_at_ms,
  };
}

export function insertSessionDocument(
  db: Database,
  params: {
    id: string;
    sessionId: string;
    uploadedByUserId: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    contentHash: string;
    s3Key: string;
    memoryKey: string;
    summary?: string;
    status?: DocumentProcessingStatus;
    turnId?: string | null;
  },
): SessionDocumentRecord {
  const createdAtMs = Date.now();
  const status = params.status ?? "accepted";
  const summary = params.summary ?? "";
  db.prepare(
    `INSERT INTO session_documents (
       id, session_id, uploaded_by_user_id, file_name, mime_type, byte_size,
       content_hash, s3_key, memory_key, summary, status, error_message,
       task_run_id, turn_id, processed_at_ms, created_at_ms
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?)`,
  ).run(
    params.id,
    params.sessionId,
    params.uploadedByUserId,
    params.fileName,
    params.mimeType,
    params.byteSize,
    params.contentHash,
    params.s3Key,
    params.memoryKey,
    summary,
    status,
    params.turnId ?? null,
    createdAtMs,
  );

  const row = db
    .query<SessionDocumentRow, [string]>(`SELECT * FROM session_documents WHERE id = ? LIMIT 1`)
    .get(params.id);
  if (row === null) throw new Error("session document insert failed");
  return mapSessionDocument(row);
}

export function getSessionDocument(
  db: Database,
  sessionId: string,
  documentId: string,
): SessionDocumentRecord | null {
  const row = db
    .query<SessionDocumentRow, [string, string]>(
      `SELECT * FROM session_documents WHERE id = ? AND session_id = ? LIMIT 1`,
    )
    .get(documentId, sessionId);
  return row === null ? null : mapSessionDocument(row);
}

export function getSessionDocumentById(
  db: Database,
  documentId: string,
): SessionDocumentRecord | null {
  const row = db
    .query<SessionDocumentRow, [string]>(`SELECT * FROM session_documents WHERE id = ? LIMIT 1`)
    .get(documentId);
  return row === null ? null : mapSessionDocument(row);
}

export function listSessionDocuments(db: Database, sessionId: string): SessionDocumentRecord[] {
  const rows = db
    .query<SessionDocumentRow, [string]>(
      `SELECT * FROM session_documents
       WHERE session_id = ?
       ORDER BY created_at_ms DESC`,
    )
    .all(sessionId);
  return rows.map(mapSessionDocument);
}

export function getSessionDocumentsForUser(
  db: Database,
  sessionId: string,
  userId: string,
  documentIds: readonly string[],
): SessionDocumentRecord[] {
  if (documentIds.length === 0) return [];
  const placeholders = documentIds.map(() => "?").join(", ");
  const rows = db
    .query<SessionDocumentRow, string[]>(
      `SELECT * FROM session_documents
       WHERE session_id = ?
         AND uploaded_by_user_id = ?
         AND id IN (${placeholders})`,
    )
    .all(sessionId, userId, ...documentIds);
  return rows.map(mapSessionDocument);
}

export function patchSessionDocument(
  db: Database,
  documentId: string,
  patch: {
    status?: DocumentProcessingStatus;
    summary?: string | null;
    errorMessage?: string | null;
    taskRunId?: string | null;
    turnId?: string | null;
    processedAtMs?: number | null;
  },
): SessionDocumentRecord | null {
  const current = getSessionDocumentById(db, documentId);
  if (current === null) return null;

  const next = {
    status: patch.status ?? current.status,
    summary: patch.summary !== undefined ? patch.summary : current.summary,
    errorMessage: patch.errorMessage !== undefined ? patch.errorMessage : current.errorMessage,
    taskRunId: patch.taskRunId !== undefined ? patch.taskRunId : current.taskRunId,
    turnId: patch.turnId !== undefined ? patch.turnId : current.turnId,
    processedAtMs: patch.processedAtMs !== undefined ? patch.processedAtMs : current.processedAtMs,
  };

  db.prepare(
    `UPDATE session_documents
     SET status = ?, summary = ?, error_message = ?, task_run_id = ?, turn_id = ?, processed_at_ms = ?
     WHERE id = ?`,
  ).run(
    next.status,
    next.summary,
    next.errorMessage,
    next.taskRunId,
    next.turnId,
    next.processedAtMs,
    documentId,
  );

  return getSessionDocumentById(db, documentId);
}

export function deleteSessionDocument(db: Database, documentId: string): void {
  db.prepare(`DELETE FROM session_documents WHERE id = ?`).run(documentId);
}
