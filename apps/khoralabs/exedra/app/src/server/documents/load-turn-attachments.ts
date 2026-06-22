import type { Database } from "bun:sqlite";

import { getTeam } from "../db/membership.js";
import { getSessionDocumentsForUser } from "./db.js";
import { buildExedraDocumentRef, ExedraDocumentStore } from "./s3-store.js";
import type { SessionDocumentRecord } from "./types.js";

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

  const records = getSessionDocumentsForUser(
    args.db,
    args.sessionId,
    args.userId,
    args.documentIds,
  );
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
    attachments.push(await loadSingleAttachment(store, team.orgId, args.sessionId, record));
  }

  return attachments;
}

async function loadSingleAttachment(
  store: ExedraDocumentStore,
  orgId: string,
  sessionId: string,
  record: SessionDocumentRecord,
): Promise<TurnDocumentAttachment> {
  const ref = buildExedraDocumentRef({
    orgId,
    sessionId,
    documentId: record.id,
    fileName: record.fileName,
    contentHash: record.contentHash,
  });
  const resolved = await store.resolve(ref);
  if (resolved.kind !== "blob") {
    throw new Error(`Document bytes unavailable: ${record.fileName}`);
  }
  const bytes = new Uint8Array(await resolved.blob.arrayBuffer());
  return {
    documentId: record.id,
    fileName: record.fileName,
    mimeType: record.mimeType,
    bytes,
  };
}
