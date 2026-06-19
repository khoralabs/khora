import type { Database } from "bun:sqlite";
import { MemoriesClient } from "@khoralabs/memories-core";
import {
  decomposeLogicalMemoryToContent,
  mergeLogicalMemoryWithMergeSlice,
} from "@khoralabs/memories-core/helpers";
import { canonicalOntology } from "@khoralabs/memories-ontologies";

import { getTeam } from "../db/membership.js";
import { bootstrapSessionMemoriesForTeamSession } from "../memories/bootstrap-session.js";
import { createExedraMemoriesEmbeddingModel } from "../memories/embedding.js";
import { orgSessionScope } from "../memories/namespaces.js";
import { openOrgMemories } from "../memories/store.js";
import { insertSessionDocument } from "./db.js";
import { ExedraDocumentStore } from "./s3-store.js";
import { summarizeDocument } from "./summarize.js";
import type { SessionDocumentRecord } from "./types.js";

export type IngestSessionDocumentParams = {
  db: Database;
  orgId: string;
  teamId: string;
  sessionId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  bootstrapUserIds?: readonly string[];
  store?: ExedraDocumentStore;
};

export async function ingestSessionDocument(params: IngestSessionDocumentParams): Promise<{
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
  const memoryKey = `documents/${documentId}`;
  const store = params.store ?? new ExedraDocumentStore();

  bootstrapSessionMemoriesForTeamSession(params.db, {
    teamId: params.teamId,
    sessionId: params.sessionId,
    userIds: params.bootstrapUserIds ?? [params.userId],
  });

  const summary = await summarizeDocument({
    fileName: params.fileName,
    mimeType: params.mimeType,
    bytes: params.bytes,
  });

  const { ref, s3Key } = await store.put({
    orgId: params.orgId,
    sessionId: params.sessionId,
    documentId,
    fileName: params.fileName,
    mimeType: params.mimeType,
    bytes: params.bytes,
  });

  const embeddingModel = createExedraMemoriesEmbeddingModel();
  const namespace = orgSessionScope(params.orgId, params.teamId, params.sessionId);
  const content = await decomposeLogicalMemoryToContent({
    key: memoryKey,
    namespace,
    plaintext: summary,
    files: [
      {
        blob: new Blob([params.bytes as unknown as Uint8Array<ArrayBuffer>], {
          type: params.mimeType,
        }),
        mimeType: params.mimeType,
        fileName: params.fileName,
        title: params.fileName,
        fallbackText: summary,
      },
    ],
    embedding: {
      embeddingModel,
      multimodal: true,
    },
  });

  const persistence = openOrgMemories(params.orgId);
  const client = new MemoriesClient(persistence, canonicalOntology);
  await mergeLogicalMemoryWithMergeSlice(
    client,
    {
      key: memoryKey,
      namespace,
      plaintext: summary,
      content,
    },
    {
      properties: {
        sourceRef: ref,
        fileName: params.fileName,
        mimeType: params.mimeType,
        summary,
        uploadedByUserId: params.userId,
        documentId,
      },
      labels: [],
      edges: [],
    },
    embeddingModel,
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
    summary,
  });

  return {
    document: record,
    sourceRef: ref,
  };
}

export function resolveSessionOrgId(db: Database, teamId: string): string {
  const team = getTeam(db, teamId);
  if (team === null) throw new Error("Team not found");
  return team.orgId;
}
