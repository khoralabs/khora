import type { Database } from "bun:sqlite";

import { resolveDocumentMemoryKey } from "../../../../shared/document-processing.js";
import { getTeam } from "../db/membership.js";
import { withSpan } from "../telemetry/spans.js";
import { insertSessionDocument } from "./db.js";
import { ExedraDocumentStore } from "./s3-store.js";
import type { SessionDocumentRecord } from "./types.js";

export type AcceptSessionDocumentParams = {
  db: Database;
  orgId: string;
  sessionId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  store?: ExedraDocumentStore;
};

export async function acceptSessionDocument(params: AcceptSessionDocumentParams): Promise<{
  document: SessionDocumentRecord;
  sourceRef: {
    domain: "exedra_document";
    org_id: string;
    session_id: string;
    document_id: string;
    file_name: string;
    content_hash: string;
  };
}> {
  const documentId = crypto.randomUUID();

  return withSpan(
    "document.accept",
    {
      "session.id": params.sessionId,
      "document.id": documentId,
      "file.name": params.fileName,
      "file.mime_type": params.mimeType,
    },
    async () => {
      const memoryKey = resolveDocumentMemoryKey(params.sessionId, documentId);
      const store = params.store ?? new ExedraDocumentStore();

      const { ref, s3Key } = await withSpan("document.s3_put", {}, async () =>
        store.put({
          orgId: params.orgId,
          sessionId: params.sessionId,
          documentId,
          fileName: params.fileName,
          mimeType: params.mimeType,
          bytes: params.bytes,
        }),
      );

      const record = insertSessionDocument(params.db, {
        id: documentId,
        sessionId: params.sessionId,
        uploadedByUserId: params.userId,
        fileName: params.fileName,
        mimeType: params.mimeType,
        byteSize: params.bytes.byteLength,
        contentHash: ref.content_hash,
        s3Key,
        memoryKey,
        status: "accepted",
      });

      return {
        document: record,
        sourceRef: ref,
      };
    },
  );
}

export function resolveSessionOrgId(db: Database, teamId: string): string {
  const team = getTeam(db, teamId);
  if (team === null) throw new Error("Team not found");
  return team.orgId;
}
