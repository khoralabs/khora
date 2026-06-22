import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { grantSessionCreatorAccess } from "../authz/index.js";
import { closeDb } from "../db/index.js";
import { ensureExedraSchema } from "../db/schema.js";
import { createOrg, createSession, createTeam } from "../db/sessions.js";
import { getOrCreateUser } from "../identity/users.js";
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
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-doc-accept-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.EXEDRA_DOCUMENTS_S3_BUCKET = "test-bucket";
  closeDb();
});

afterEach(() => {
  closeDb();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.EXEDRA_IDENTITY_KEY;
  delete process.env.EXEDRA_DOCUMENTS_S3_BUCKET;
});

test("acceptSessionDocument stores S3 object and accepted row without summary", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const user = await getOrCreateUser(db, "registry-doc-accept");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Docs",
  });
  grantSessionCreatorAccess(db, user.id, session.id);

  const { acceptSessionDocument } = await import("./ingest.js");
  const text = "Paragraph one.\n\nParagraph two.";
  const bytes = new TextEncoder().encode(text);

  const result = await acceptSessionDocument({
    db,
    orgId,
    sessionId: session.id,
    userId: user.id,
    fileName: "notes.txt",
    mimeType: "text/plain",
    bytes,
    store: new MemoryDocumentStore(),
  });

  expect(result.document.status).toBe("accepted");
  expect(result.document.summary).toBe("");
  expect(result.document.memoryKey).toBe(`documents/${session.id}/${result.document.id}`);

  const row = getSessionDocument(db, session.id, result.document.id);
  expect(row?.s3Key).toContain(session.id);
  expect(row?.contentHash).toHaveLength(64);
  db.close();
});
