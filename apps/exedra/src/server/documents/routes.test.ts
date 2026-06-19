import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { grantSessionCreatorAccess } from "../authz/index.js";
import { closeDb } from "../db/index.js";
import { ensureExedraSchema } from "../db/schema.js";
import { createOrg, createSession, createTeam } from "../db/sessions.js";
import { getOrCreateUser } from "../identity/users.js";
import { resetMemoriesStoreForTests } from "../memories/store.js";

let dataDir: string;

beforeEach(() => {
  mock.restore();
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-doc-routes-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY = "test-memories-key";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
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

test("POST /api/sessions/:sessionId/documents requires auth", async () => {
  mock.module("../auth/require-session.js", () => ({
    requireRegistrySessionResponse: async () => ({
      session: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    }),
  }));

  process.env.EXEDRA_DOCUMENTS_S3_BUCKET = "test-bucket";
  const { handleUploadSessionDocument } = await import("./routes.js");

  const res = await handleUploadSessionDocument(
    new Request("http://localhost/api/sessions/s1/documents", { method: "POST" }),
    "s1",
  );

  expect(res.status).toBe(401);
});

test("POST /api/sessions/:sessionId/documents rejects users without session access", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const owner = await getOrCreateUser(db, "registry-doc-owner");
  const _outsider = await getOrCreateUser(db, "registry-doc-outsider");
  const orgId = await createOrg(db, { name: "Org", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: owner.id });
  const session = createSession(db, {
    teamId,
    topic: "Private",
  });
  grantSessionCreatorAccess(db, owner.id, session.id);
  db.close();

  process.env.EXEDRA_DOCUMENTS_S3_BUCKET = "test-bucket";
  const { mock: bunMock } = await import("bun:test");
  bunMock.module("../auth/require-session.js", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-doc-outsider" } },
      response: null,
    }),
  }));

  const { handleUploadSessionDocument } = await import("./routes.js");
  const formData = new FormData();
  formData.set("file", new File(["hello"], "notes.txt", { type: "text/plain" }));

  const res = await handleUploadSessionDocument(
    new Request(`http://localhost/api/sessions/${session.id}/documents`, {
      method: "POST",
      body: formData,
    }),
    session.id,
  );

  expect(res.status).toBe(403);
});

test("POST /api/sessions/:sessionId/documents returns 503 when S3 is not configured", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const user = await getOrCreateUser(db, "registry-doc-no-s3");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Docs",
  });
  grantSessionCreatorAccess(db, user.id, session.id);
  db.close();

  const { mock: bunMock } = await import("bun:test");
  bunMock.module("../auth/require-session.js", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-doc-no-s3" } },
      response: null,
    }),
  }));

  const { handleUploadSessionDocument } = await import("./routes.js");
  const formData = new FormData();
  formData.set("file", new File(["hello"], "notes.txt", { type: "text/plain" }));

  const res = await handleUploadSessionDocument(
    new Request(`http://localhost/api/sessions/${session.id}/documents`, {
      method: "POST",
      body: formData,
    }),
    session.id,
  );

  expect(res.status).toBe(503);
});

test("POST /api/sessions/:sessionId/documents stores metadata on happy path", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const user = await getOrCreateUser(db, "registry-doc-upload");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Docs",
  });
  grantSessionCreatorAccess(db, user.id, session.id);
  db.close();

  process.env.EXEDRA_DOCUMENTS_S3_BUCKET = "test-bucket";
  const { mock: bunMock } = await import("bun:test");
  bunMock.module("../auth/require-session.js", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-doc-upload" } },
      response: null,
    }),
  }));

  const documentId = crypto.randomUUID();
  bunMock.module("./ingest.js", () => ({
    ingestSessionDocument: async () => ({
      document: {
        id: documentId,
        sessionId: session.id,
        uploadedByUserId: user.id,
        fileName: "notes.txt",
        mimeType: "text/plain",
        byteSize: 5,
        contentHash: "abc123",
        s3Key: "exedra/documents/test",
        memoryKey: `documents/${documentId}`,
        summary: "Uploaded notes",
        createdAtMs: Date.now(),
      },
      sourceRef: {
        domain: "exedra_document",
        org_id: orgId,
        session_id: session.id,
        document_id: documentId,
        file_name: "notes.txt",
        content_hash: "abc123",
      },
    }),
    resolveSessionOrgId: () => orgId,
  }));

  const { handleUploadSessionDocument } = await import("./routes.js");
  const formData = new FormData();
  formData.set("file", new File(["hello"], "notes.txt", { type: "text/plain" }));

  const res = await handleUploadSessionDocument(
    new Request(`http://localhost/api/sessions/${session.id}/documents`, {
      method: "POST",
      body: formData,
    }),
    session.id,
  );

  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    document: { id: string; fileName: string; summary: string };
  };
  expect(body.document.id).toBe(documentId);
  expect(body.document.fileName).toBe("notes.txt");
  expect(body.document.summary).toBe("Uploaded notes");
});
