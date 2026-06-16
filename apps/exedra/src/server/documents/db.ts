import type { Database } from "bun:sqlite";

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
  summary: string;
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
    summary: row.summary,
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
    summary: string;
  },
): SessionDocumentRecord {
  const createdAtMs = Date.now();
  db.prepare(
    `INSERT INTO session_documents (
       id, session_id, uploaded_by_user_id, file_name, mime_type, byte_size,
       content_hash, s3_key, memory_key, summary, created_at_ms
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    params.summary,
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
