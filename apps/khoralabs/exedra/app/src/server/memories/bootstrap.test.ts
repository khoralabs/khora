import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createNoneAuthStrategy } from "@khoralabs/memories-service-auth";
import { MemoriesServiceClient } from "@khoralabs/memories-service-client";
import { createMemoriesServiceHttpServer } from "@khoralabs/memories-service-http";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service-storage-sqlite";

import { bootstrapOrgTeamMemories, bootstrapSessionMemories } from "./bootstrap";
import {
  orgScope,
  orgSessionScope,
  orgTeamScope,
  userScope,
  userSessionScope,
  userTeamScope,
} from "./namespaces";
import { openOrgMemoriesService, resetMemoriesServiceClientCacheForTests } from "./service-client";
import { setupTestKnowledgeService } from "./test-knowledge-service";

let dataDir: string;
let knowledgeService: ReturnType<typeof setupTestKnowledgeService> | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-memories-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  knowledgeService = setupTestKnowledgeService(dataDir);
  resetMemoriesServiceClientCacheForTests();
});

afterEach(() => {
  knowledgeService?.stop();
  knowledgeService = undefined;
  resetMemoriesServiceClientCacheForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY;
  delete process.env.EXEDRA_KNOWLEDGE_SERVICE_URL;
});

async function listScopes(database: { kind: string; ownerKey: string }): Promise<string[]> {
  const stack = createLocalSqliteServiceStack({
    dataDir: path.join(dataDir, "knowledge"),
    sqlCipherKey: "test-knowledge-key",
  });
  const server = createMemoriesServiceHttpServer({
    port: 0,
    service: stack.service,
    auth: createNoneAuthStrategy(),
  });
  try {
    const client = new MemoriesServiceClient({ baseUrl: `http://localhost:${server.port}` });
    await client.openDatabase(database);
    const handle = await stack.service.getHandle(database);
    const sqlite = handle.sqlite;
    if (sqlite === undefined) throw new Error("expected sqlite");
    return sqlite.db
      .query<{ _id: string }, []>(`SELECT _id FROM scopes ORDER BY _id ASC`)
      .all()
      .map((row) => row._id);
  } finally {
    server.stop(true);
  }
}

describe("bootstrap via memories service", () => {
  test("bootstrapOrgTeamMemories creates org and user scope chains", async () => {
    const orgId = "org-bootstrap";
    const teamId = "team-bootstrap";
    const userId = "user-bootstrap";

    const first = await bootstrapOrgTeamMemories({ orgId, teamId, userId });
    expect(first.orgDatabase.ownerKey).toBe(orgId);
    expect(first.userDatabase.ownerKey).toBe(userId);

    const orgAccess = await openOrgMemoriesService(orgId);
    expect(orgAccess.ontologyHash.length).toBeGreaterThan(0);

    const second = await bootstrapOrgTeamMemories({ orgId, teamId, userId });
    expect(second.orgDatabase).toEqual(first.orgDatabase);
    expect(first.userDatabase).toEqual(second.userDatabase);

    const orgScopes = await listScopes(first.orgDatabase);
    expect(orgScopes.sort((a, b) => a.localeCompare(b))).toEqual(
      ["_global_", orgScope(orgId), orgTeamScope(orgId, teamId)].sort((a, b) => a.localeCompare(b)),
    );

    const userScopes = await listScopes(first.userDatabase);
    expect(userScopes.sort((a, b) => a.localeCompare(b))).toEqual(
      ["_global_", userScope(userId), userTeamScope(userId, orgId, teamId)].sort((a, b) =>
        a.localeCompare(b),
      ),
    );
  });

  test("bootstrapSessionMemories creates org and user session scope chains under team", async () => {
    const orgId = "org-session";
    const teamId = "team-session";
    const userId = "user-session";
    const sessionId = crypto.randomUUID();

    await bootstrapOrgTeamMemories({ orgId, teamId, userId });
    await bootstrapSessionMemories({
      orgId,
      teamId,
      sessionId,
      userIds: [userId],
    });

    const orgScopes = await listScopes({ kind: "organization", ownerKey: orgId });
    expect(orgScopes.sort((a, b) => a.localeCompare(b))).toEqual(
      [
        "_global_",
        orgScope(orgId),
        orgTeamScope(orgId, teamId),
        orgSessionScope(orgId, teamId, sessionId),
      ].sort((a, b) => a.localeCompare(b)),
    );

    const userScopes = await listScopes({ kind: "account", ownerKey: userId });
    expect(userScopes.sort((a, b) => a.localeCompare(b))).toEqual(
      [
        "_global_",
        userScope(userId),
        userTeamScope(userId, orgId, teamId),
        userSessionScope(userId, orgId, teamId, sessionId),
      ].sort((a, b) => a.localeCompare(b)),
    );
  });
});
