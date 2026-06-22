import type { Database } from "bun:sqlite";

import { getTeam } from "../db/membership.js";
import { getDocumentsForUser } from "./db.js";
import { ExedraDocumentStore } from "./s3-store.js";
import type { DocumentRecord } from "./types.js";

export type TurnDocumentAttachment = {
  documentId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export async function loadTurnDocumentAttachments(args: {
  db: Database;
  sessionId: string;
  teamId: string;
  userId: string;
  documentIds: readonly string[];
  store?: ExedraDocumentStore;
}): Promise<TurnDocumentAttachment[]> {
  if (args.documentIds.length === 0) return [];

  const records = getDocumentsForUser(args.db, args.sessionId, args.userId, args.documentIds);
  if (records.length !== args.documentIds.length) {
    throw new Error("One or more documents are invalid or not owned by you");
  }

  for (const record of records) {
    if (
      record.status !== "accepted" &&
      record.status !== "processing" &&
      record.status !== "ready"
    ) {
      throw new Error(`Document ${record.fileName} is not available`);
    }
  }

  const team = getTeam(args.db, args.teamId);
  if (team === null) throw new Error("Team not found");

  const store = args.store ?? new ExedraDocumentStore();
  const byId = new Map(records.map((record) => [record.id, record] as const));
  const attachments: TurnDocumentAttachment[] = [];

  for (const documentId of args.documentIds) {
    const record = byId.get(documentId);
    if (record === undefined) continue;
    attachments.push(await loadSingleAttachment(store, record));
  }

  return attachments;
}

async function loadSingleAttachment(
  store: ExedraDocumentStore,
  record: DocumentRecord,
): Promise<TurnDocumentAttachment> {
  const resolved = await store.getByS3Key({
    s3Key: record.s3Key,
    contentHash: record.contentHash,
    mimeType: record.mimeType,
  });
  const bytes = new Uint8Array(await resolved.blob.arrayBuffer());
  return {
    documentId: record.id,
    fileName: record.fileName,
    mimeType: record.mimeType,
    bytes,
  };
}
