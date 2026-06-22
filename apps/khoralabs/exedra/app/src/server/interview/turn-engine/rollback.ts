import type { Database } from "bun:sqlite";

import { MemoriesClient } from "@khoralabs/memories-core";
import { resolveDocumentMemoryKey } from "../../../../../shared/document-processing.js";
import { getTeam } from "../../db/membership";
import { deleteDocument, getDocumentsForUser } from "../../documents/db";
import { cancelDocumentProcessingTaskRun } from "../../documents/dispatch-batch-integration";
import { buildExedraDocumentRef, ExedraDocumentStore } from "../../documents/s3-store";
import { exedraMemoriesOntology } from "../../memories/exedra-ontology.js";
import { openUserMemories } from "../../memories/store.js";

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

  const records = getDocumentsForUser(db, sessionId, userId, documentIds);
  if (records.length === 0) return;

  const client = new MemoriesClient(openUserMemories(userId), exedraMemoriesOntology);
  const store = new ExedraDocumentStore();

  for (const record of records) {
    await cancelDocumentProcessingTaskRun(record.taskRunId);

    const namespace = record.targetNamespace;
    const keys = [resolveDocumentMemoryKey(record.batchId, record.id)];
    if (record.status === "ready" || record.status === "processing") {
      for (let index = 0; index < 64; index++) {
        keys.push(resolveDocumentMemoryKey(record.batchId, record.id, index));
      }
    }

    for (const key of keys) {
      client.deleteMemory({ namespace, key });
    }

    const ref = buildExedraDocumentRef({
      orgId: team.orgId,
      batchId: record.batchId,
      documentId: record.id,
      fileName: record.fileName,
      contentHash: record.contentHash,
    });
    await store.deleteByRef(ref).catch(() => undefined);
    deleteDocument(db, record.id);
  }
}
