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
import { orgSessionScope } from "../memories/namespaces.js";
import { resetMemoriesStoreForTests } from "../memories/store.js";

let dataDir: string;

beforeEach(() => {
  mock.restore();
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-contribute-routes-test-"));
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

test("POST /api/documents/contribute accepts session namespace documents for session creator", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const user = await getOrCreateUser(db, "registry-contribute-session");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Session setup docs",
  });
  await grantSessionCreatorAccess(user.id, session.id);
  const namespace = orgSessionScope(orgId, teamId, session.id);
  db.close();

  process.env.EXEDRA_DOCUMENTS_S3_BUCKET = "test-bucket";
  const { mock: bunMock } = await import("bun:test");
  bunMock.module("../auth/require-session.js", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-contribute-session" } },
      response: null,
    }),
  }));

  const batchId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  bunMock.module("./batch-contribute.js", () => ({
    MAX_BATCH_FILES: 10,
    acceptContributionBatch: async () => ({
      batchId,
      documents: [
        {
          id: documentId,
          batchId,
          targetNamespace: namespace,
          grantResourceType: "session",
          grantResourceId: session.id,
          orgId,
          teamId,
          uploadedByUserId: user.id,
          fileName: "brief.txt",
          mimeType: "text/plain",
          byteSize: 11,
          contentHash: "abc123",
          s3Key: "exedra/documents/test",
          memoryKey: `documents/${batchId}/${documentId}`,
          summary: "",
          status: "accepted",
          errorMessage: null,
          taskRunId: null,
          processedAtMs: null,
          createdAtMs: Date.now(),
        },
      ],
    }),
    buildBatchWire: () => ({
      batchId,
      contextText: "",
      status: "accepted",
      targetNamespace: namespace,
      grantResource: { type: "session", id: session.id },
      orgId,
      teamId,
      documents: [
        {
          id: documentId,
          fileName: "brief.txt",
          mimeType: "text/plain",
          memoryKey: `documents/${batchId}/${documentId}`,
          status: "accepted",
          summary: "",
          contentHash: "abc123",
          targetNamespace: namespace,
          errorMessage: null,
          processedAtMs: null,
          createdAtMs: Date.now(),
        },
      ],
    }),
    dispatchAcceptedBatch: async () => {},
    resolveContributionGrantResource: (args: { sessionId?: string | null }) => ({
      type: "session",
      id: args.sessionId ?? session.id,
    }),
    userCanContributeViaGrant: async () => true,
    userCanViewDocumentsForGrant: async () => true,
  }));

  const { handleContributeDocuments } = await import("./contribute-routes.js");
  const formData = new FormData();
  formData.set("namespace", namespace);
  formData.set("orgId", orgId);
  formData.set("teamId", teamId);
  formData.set("sessionId", session.id);
  formData.append("files", new File(["session doc"], "brief.txt", { type: "text/plain" }));

  const res = await handleContributeDocuments(
    new Request("http://localhost/api/documents/contribute", {
      method: "POST",
      body: formData,
    }),
  );

  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    batch: { targetNamespace: string; grantResource: { type: string; id: string } };
  };
  expect(body.batch.targetNamespace).toBe(namespace);
  expect(body.batch.grantResource).toEqual({ type: "session", id: session.id });
});

test("POST /api/documents/contribute rejects users without session access", async () => {
  const db = new Database(path.join(dataDir, "exedra.db"), { create: true });
  ensureExedraSchema(db);
  const owner = await getOrCreateUser(db, "registry-contribute-owner");
  const orgId = await createOrg(db, { name: "Org", ownerId: owner.id });
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: owner.id });
  const session = createSession(db, {
    teamId,
    topic: "Private session",
  });
  await grantSessionCreatorAccess(owner.id, session.id);
  const namespace = orgSessionScope(orgId, teamId, session.id);
  db.close();

  process.env.EXEDRA_DOCUMENTS_S3_BUCKET = "test-bucket";
  const { mock: bunMock } = await import("bun:test");
  bunMock.module("../auth/require-session.js", () => ({
    requireRegistrySessionResponse: async () => ({
      session: { user: { id: "registry-contribute-outsider" } },
      response: null,
    }),
  }));
  bunMock.module("./batch-contribute.js", () => ({
    MAX_BATCH_FILES: 10,
    acceptContributionBatch: async () => {
      throw new Error("should not accept");
    },
    buildBatchWire: () => null,
    dispatchAcceptedBatch: async () => {},
    resolveContributionGrantResource: (args: { sessionId?: string | null }) => ({
      type: "session",
      id: args.sessionId ?? session.id,
    }),
    userCanContributeViaGrant: async () => false,
    userCanViewDocumentsForGrant: async () => false,
  }));

  const { handleContributeDocuments } = await import("./contribute-routes.js");
  const formData = new FormData();
  formData.set("namespace", namespace);
  formData.set("orgId", orgId);
  formData.set("teamId", teamId);
  formData.set("sessionId", session.id);
  formData.append("files", new File(["session doc"], "brief.txt", { type: "text/plain" }));

  const res = await handleContributeDocuments(
    new Request("http://localhost/api/documents/contribute", {
      method: "POST",
      body: formData,
    }),
  );

  expect(res.status).toBe(403);
});
