import type { Database } from "bun:sqlite";

import { getTeam } from "../../db/membership";
import { getSessionDocumentsForUser } from "../../documents/db";
import { buildExedraDocumentRef, ExedraDocumentStore } from "../../documents/s3-store";

export async function rollbackTurnDocuments(args: {
  db: Database;
  sessionId: string;
  teamId: string;
  userId: string;
  documentIds: readonly string[];
}): Promise<void> {
  const { db, sessionId, teamId, userId, documentIds } = args;
  if (documentIds.length === 0) return;

  const team = getTeam(db, teamId);
  if (team === null) return;

  const records = getSessionDocumentsForUser(db, sessionId, userId, documentIds);
  if (records.length === 0) return;

  const store = new ExedraDocumentStore();
  for (const record of records) {
    const ref = buildExedraDocumentRef({
      orgId: team.orgId,
      sessionId,
      documentId: record.id,
      fileName: record.fileName,
      contentHash: record.contentHash,
    });
    await store.deleteByRef(ref).catch(() => undefined);
    db.prepare(`DELETE FROM session_documents WHERE id = ?`).run(record.id);
  }
}
