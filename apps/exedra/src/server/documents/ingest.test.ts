import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { closeDb } from "../db/index.js";
import { ensureExedraSchema } from "../db/schema.js";
import { createOrg, createSession, createTeam } from "../db/sessions.js";
import { getOrCreateUser } from "../identity/users.js";
import { resetMemoriesStoreForTests } from "../memories/store.js";
import { getSessionDocument } from "./db.js";
import { sha256Hex } from "./hash.js";
import { buildDocumentS3Key } from "./s3-store.js";
import type { ExedraDocumentRef } from "./types.js";

let dataDir: string;

class MemoryDocumentStore {
  private readonly objects = new Map<string, Uint8Array>();

  async put(params: {
    orgId: string;
    sessionId: string;
    documentId: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }) {
    const contentHash = await sha256Hex(params.bytes);
    const s3Key = buildDocumentS3Key(params);
    this.objects.set(s3Key, params.bytes);
    const ref: ExedraDocumentRef = {
      domain: "exedra_document",
      org_id: params.orgId,
      session_id: params.sessionId,
      document_id: params.documentId,
      file_name: params.fileName,
      content_hash: contentHash,
    };
    return { ref, s3Key };
  }

  async resolve(ref: ExedraDocumentRef) {
    const s3Key = buildDocumentS3Key({
      orgId: ref.org_id,
      sessionId: ref.session_id,
      documentId: ref.document_id,
      fileName: ref.file_name,
    });
    const bytes = this.objects.get(s3Key);
    if (bytes === undefined) throw new Error("missing object");
    const contentHash = await sha256Hex(bytes);
    if (contentHash !== ref.content_hash) throw new Error("hash mismatch");
    return { kind: "blob" as const, blob: new Blob([bytes]) };
  }
}

beforeEach(() => {
  mock.restore();
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-doc-ingest-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY = "test-memories-key";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.EXEDRA_DOCUMENTS_S3_BUCKET = "test-bucket";
  closeDb();
  resetMemoriesStoreForTests();
});

afterEach(() => {
  closeDb();
  resetMemoriesStoreForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY;
  delete process.env.EXEDRA_IDENTITY_KEY;
  delete process.env.EXEDRA_DOCUMENTS_S3_BUCKET;
  mock.restore();
});

test("ingestSessionDocument indexes text file with summary and chunked content", async () => {
  mock.module("./summarize.js", () => ({
    summarizeDocument: async () => "LLM summary for notes",
  }));
  mock.module("../memories/embedding.js", () => ({
    createExedraMemoriesEmbeddingModel: () => ({
      model: "google/gemini-embedding-2-preview",
      textBatchSize: 100,
    }),
  }));

  let capturedContentKeys: string[] = [];
  mock.module("@khoralabs/memories-core/helpers", () => ({
    decomposeLogicalMemoryToContent: async () => {
      capturedContentKeys = ["text:0", "file:0:chunk:0", "file:0:chunk:1"];
      return capturedContentKeys.map((key) => ({ key, text: key, vector: [0.1, 0.2] }));
    },
    mergeLogicalMemoryWithMergeSlice: async () => {},
    isTextLikeMime: (mime: string) => mime.startsWith("text/"),
  }));

  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const user = await getOrCreateUser(db, "registry-doc-ingest");
  const orgId = createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Docs",
    facilitatorId: user.id,
  });

  const { ingestSessionDocument } = await import("./ingest.js");
  const text = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
  const bytes = new TextEncoder().encode(text);

  const result = await ingestSessionDocument({
    db,
    orgId,
    teamId,
    sessionId: session.id,
    userId: user.id,
    fileName: "notes.txt",
    mimeType: "text/plain",
    bytes,
    store: new MemoryDocumentStore(),
  });

  expect(result.document.memoryKey).toBe(`documents/${result.document.id}`);
  expect(result.document.summary).toBe("LLM summary for notes");
  expect(capturedContentKeys.some((key) => key.includes("chunk:"))).toBe(true);

  const row = getSessionDocument(db, session.id, result.document.id);
  expect(row?.s3Key).toContain(session.id);
  expect(row?.contentHash).toHaveLength(64);
  db.close();
});

test("ingestSessionDocument indexes binary file with summary text and vector chunk", async () => {
  mock.module("./summarize.js", () => ({
    summarizeDocument: async () => "Binary summary",
  }));
  mock.module("../memories/embedding.js", () => ({
    createExedraMemoriesEmbeddingModel: () => ({
      model: "google/gemini-embedding-2-preview",
      textBatchSize: 100,
    }),
  }));

  let capturedContent: { key: string; text?: string; vector?: number[] }[] = [];
  mock.module("@khoralabs/memories-core/helpers", () => ({
    decomposeLogicalMemoryToContent: async () => {
      capturedContent = [
        { key: "text:0", text: "Binary summary", vector: [0.1, 0.2] },
        { key: "file:0:0", vector: [0.3, 0.4] },
      ];
      return capturedContent;
    },
    mergeLogicalMemoryWithMergeSlice: async () => {},
    isTextLikeMime: () => false,
  }));

  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const user = await getOrCreateUser(db, "registry-doc-binary");
  const orgId = createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Docs",
    facilitatorId: user.id,
  });

  const { ingestSessionDocument } = await import("./ingest.js");
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

  await ingestSessionDocument({
    db,
    orgId,
    teamId,
    sessionId: session.id,
    userId: user.id,
    fileName: "report.pdf",
    mimeType: "application/pdf",
    bytes,
    store: new MemoryDocumentStore(),
  });

  expect(capturedContent.some((item) => item.key.startsWith("text:"))).toBe(true);
  expect(capturedContent.some((item) => item.key.startsWith("file:") && item.vector)).toBe(true);
  db.close();
});
