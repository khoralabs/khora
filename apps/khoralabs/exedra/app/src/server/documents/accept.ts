import type { Database } from "bun:sqlite";
import { resolveDocumentMemoryKey } from "@khoralabs/exedra-workflows-process-document/document-processing";
import { publishDocumentProtectedBy } from "../authz/facts.js";
import { ResourceType } from "../authz/policy.js";
import { getTeam } from "../db/membership.js";
import { userSessionScope } from "../memories/namespaces.js";
import { withSpan } from "../telemetry/spans.js";
import { insertDocument } from "./db.js";
import { ExedraDocumentStore } from "./s3-store.js";
import type { DocumentGrantResource, DocumentRecord, ExedraDocumentRef } from "./types.js";

export type AcceptDocumentParams = {
  db: Database;
  orgId: string;
  batchId: string;
  targetNamespace: string;
  grantResource: DocumentGrantResource;
  teamId?: string | null;
  userId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  store?: ExedraDocumentStore;
};

export async function acceptDocument(params: AcceptDocumentParams): Promise<{
  document: DocumentRecord;
  sourceRef: ExedraDocumentRef;
}> {
  const documentId = crypto.randomUUID();

  return withSpan(
    "document.accept",
    {
      "document.id": documentId,
      "document.batch_id": params.batchId,
      "file.name": params.fileName,
      "file.mime_type": params.mimeType,
    },
    async () => {
      const memoryKey = resolveDocumentMemoryKey(params.batchId, documentId);
      const store = params.store ?? new ExedraDocumentStore();

      const { ref, s3Key } = await withSpan("document.s3_put", {}, async () =>
        store.put({
          grantResource: params.grantResource,
          orgId: params.orgId,
          userId: params.userId,
          batchId: params.batchId,
          documentId,
          fileName: params.fileName,
          mimeType: params.mimeType,
          bytes: params.bytes,
        }),
      );

      const record = insertDocument(params.db, {
        id: documentId,
        batchId: params.batchId,
        targetNamespace: params.targetNamespace,
        grantResource: params.grantResource,
        orgId: params.grantResource.type === ResourceType.Session ? null : params.orgId,
        teamId:
          params.grantResource.type === ResourceType.Team
            ? params.grantResource.id
            : (params.teamId ?? null),
        uploadedByUserId: params.userId,
        fileName: params.fileName,
        mimeType: params.mimeType,
        byteSize: params.bytes.byteLength,
        contentHash: ref.content_hash,
        s3Key,
        memoryKey,
        status: "accepted",
      });

      await publishDocumentProtectedBy(documentId, params.grantResource);

      return { document: record, sourceRef: ref };
    },
  );
}

export async function resolveSessionOrgId(db: Database, teamId: string): Promise<string> {
  const team = await getTeam(db, teamId);
  if (team === null) throw new Error("Team not found");
  return team.orgId;
}

export function resolveSessionTargetNamespace(
  userId: string,
  orgId: string,
  teamId: string,
  sessionId: string,
): string {
  return userSessionScope(userId, orgId, teamId, sessionId);
}
