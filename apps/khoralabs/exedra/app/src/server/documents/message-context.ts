import type { Database } from "bun:sqlite";

import { getTeam } from "../db/membership.js";
import { getDocumentsForUser } from "./db.js";
import { buildExedraDocumentRef } from "./s3-store.js";
import type { ExedraDocumentRef, SessionDocumentWireRef } from "./types.js";

export type UserMessageDocumentMetadata = {
  id: string;
  fileName: string;
  memoryKey: string;
  sourceRef: ExedraDocumentRef;
};

export function resolveUserMessageDocuments(
  db: Database,
  params: {
    sessionId: string;
    teamId: string;
    userId: string;
    documentIds: readonly string[];
  },
): UserMessageDocumentMetadata[] | { error: string } {
  const uniqueIds = [...new Set(params.documentIds.filter((id) => id.trim().length > 0))];
  if (uniqueIds.length === 0) return [];

  const records = getDocumentsForUser(db, params.sessionId, params.userId, uniqueIds);
  if (records.length !== uniqueIds.length) {
    return { error: "One or more documents are invalid or not owned by you" };
  }

  for (const record of records) {
    if (record.status !== "accepted") {
      return { error: `Document ${record.fileName} is not ready to attach` };
    }
  }

  const team = getTeam(db, params.teamId);
  if (team === null) {
    return { error: "Team not found" };
  }

  return records.map((record) => ({
    id: record.id,
    fileName: record.fileName,
    memoryKey: record.memoryKey,
    sourceRef: buildExedraDocumentRef({
      orgId: team.orgId,
      batchId: record.batchId,
      documentId: record.id,
      fileName: record.fileName,
      contentHash: record.contentHash,
    }),
  }));
}

export function formatDocumentContextForModel(
  documents: readonly UserMessageDocumentMetadata[],
  summariesById: ReadonlyMap<string, string>,
): string {
  if (documents.length === 0) return "";

  const lines = documents.map((document) => {
    const summary = summariesById.get(document.id)?.trim();
    if (summary !== undefined && summary.length > 0) {
      return `Attached: ${document.fileName} (summary: ${summary})`;
    }
    return `Attached: ${document.fileName}`;
  });

  return lines.join("\n");
}

export function toWireDocumentRefs(
  documents: readonly UserMessageDocumentMetadata[],
): SessionDocumentWireRef[] {
  return documents.map((document) => ({
    id: document.id,
    fileName: document.fileName,
    memoryKey: document.memoryKey,
    sourceRef: document.sourceRef,
  }));
}
