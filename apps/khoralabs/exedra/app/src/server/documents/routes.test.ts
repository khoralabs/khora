import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { grantSessionCreatorAccess } from "../authz/index.js";
import { ResourceType } from "../authz/policy.js";
import { closeDb } from "../db/index.js";
import { ensureExedraSchema } from "../db/schema.js";
import { createOrg, createSession, createTeam } from "../db/sessions.js";
import { getOrCreateUser } from "../identity/users.js";
import { resetMemoriesStoreForTests } from "../memories/store.js";
import { setupTestKnowledgeService } from "../memories/test-knowledge-service.js";

let dataDir: string;
let knowledgeService: ReturnType<typeof setupTestKnowledgeService> | undefined;

beforeEach(() => {
  mock.restore();
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-doc-routes-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  closeDb();
  resetMemoriesStoreForTests();
  knowledgeService = setupTestKnowledgeService(dataDir);
});

afterEach(() => {
  knowledgeService?.stop();
  knowledgeService = undefined;
  closeDb();
  resetMemoriesStoreForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY;
  delete process.env.EXEDRA_KNOWLEDGE_SERVICE_URL;
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
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: owner.id });
  const session = createSession(db, {
    teamId,
    topic: "Private",
  });
  await grantSessionCreatorAccess(owner.id, session.id);
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
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Docs",
  });
  await grantSessionCreatorAccess(user.id, session.id);
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
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Docs",
  });
  await grantSessionCreatorAccess(user.id, session.id);
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
  bunMock.module("./accept.js", () => ({
    acceptDocument: async () => ({
      document: {
        id: documentId,
        batchId: crypto.randomUUID(),
        targetNamespace: "test-namespace",
        grantResourceType: "session",
        grantResourceId: session.id,
        orgId: null,
        teamId,
        uploadedByUserId: user.id,
        fileName: "notes.txt",
        mimeType: "text/plain",
        byteSize: 5,
        contentHash: "abc123",
        s3Key: "exedra/documents/test",
        memoryKey: `documents/${session.id}/${documentId}`,
        summary: "",
        status: "accepted",
        errorMessage: null,
        taskRunId: null,
        processedAtMs: null,
        createdAtMs: Date.now(),
      },
      sourceRef: {
        domain: "exedra_document",
        org_id: orgId,
        batch_id: session.id,
        document_id: documentId,
        file_name: "notes.txt",
        content_hash: "abc123",
      },
    }),
    resolveSessionOrgId: () => orgId,
    resolveSessionTargetNamespace: () => "test-namespace",
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
    document: { id: string; fileName: string; summary: string; status: string };
  };
  expect(body.document.id).toBe(documentId);
  expect(body.document.fileName).toBe("notes.txt");
  expect(body.document.summary).toBe("");
  expect(body.document.status).toBe("accepted");
});

test("GET /api/sessions/:sessionId/documents/:documentId uses stored s3Key after batch_id patch", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const user = await getOrCreateUser(db, "registry-doc-download");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Docs",
  });
  await grantSessionCreatorAccess(user.id, session.id);

  const uploadBatchId = crypto.randomUUID();
  const turnId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const s3Key = `exedra/documents/org/${orgId}/batch/${uploadBatchId}/${documentId}/notes.txt`;
  const contentHash = "abc123hash";

  const { insertDocument, patchDocumentsBatchId } = await import("./db.js");
  insertDocument(db, {
    id: documentId,
    batchId: uploadBatchId,
    targetNamespace: "test-namespace",
    grantResource: { type: ResourceType.Session, id: session.id },
    teamId,
    uploadedByUserId: user.id,
    fileName: "notes.txt",
    mimeType: "text/plain",
    byteSize: 5,
    contentHash,
    s3Key,
    memoryKey: `documents/${uploadBatchId}/${documentId}`,
    status: "accepted",
  });
  patchDocumentsBatchId(db, [documentId], turnId);
  db.close();

  process.env.EXEDRA_DOCUMENTS_S3_BUCKET = "test-bucket";
  const { mock: bunMock } = await import("bun:test");
  bunMock.module("../auth/require-session.js", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-doc-download" } },
      response: null,
    }),
  }));

  let requestedS3Key: string | undefined;
  bunMock.module("./s3-store.js", () => ({
    ExedraDocumentStore: class {
      async getByS3Key(params: { s3Key: string; contentHash: string; mimeType?: string }) {
        requestedS3Key = params.s3Key;
        return {
          kind: "blob" as const,
          blob: new Blob(["hello"], { type: params.mimeType ?? "text/plain" }),
        };
      }

      async deleteByS3Key(_s3Key: string): Promise<void> {}
    },
  }));

  try {
    const { handleGetSessionDocument } = await import("./routes.js");
    const res = await handleGetSessionDocument(
      new Request(`http://localhost/api/sessions/${session.id}/documents/${documentId}`),
      session.id,
      documentId,
    );

    expect(res.status).toBe(200);
    expect(requestedS3Key).toBe(s3Key);
    expect(await res.text()).toBe("hello");
  } finally {
    bunMock.restore();
  }
});
