import { Database } from "bun:sqlite";
import { afterEach, beforeEach, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createIsolatedAuthzDatabase, installTestAuthzService } from "../authz/test-service";

import { closeDb } from "../db/index";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { seedOnboardingMemories } from "./seed-onboarding";
import { resetMemoriesServiceClientCacheForTests } from "./service-client";
import { setupTestKnowledgeService } from "./test-knowledge-service";

let dataDir: string;
let knowledgeService: ReturnType<typeof setupTestKnowledgeService> | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "exedra-seed-onboarding-test-"));
  process.env.EXEDRA_DATA_DIR = dataDir;
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  closeDb();
  resetMemoriesServiceClientCacheForTests();
  knowledgeService = setupTestKnowledgeService(dataDir);
});

afterEach(() => {
  knowledgeService?.stop();
  knowledgeService = undefined;
  closeDb();
  resetMemoriesServiceClientCacheForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.EXEDRA_DATA_DIR;
  delete process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY;
  delete process.env.EXEDRA_KNOWLEDGE_SERVICE_URL;
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("seedOnboardingMemories writes summary and beliefs for did:key principals", async () => {
  const authzDb = createIsolatedAuthzDatabase();
  installTestAuthzService(authzDb);
  const appDb = new Database(":memory:");
  ensureExedraSchema(appDb);
  const user = await getOrCreateUser(appDb, "registry-seed-onboarding");
  const orgId = await createOrg(appDb, { name: "Org", ownerId: user.id });
  const teamId = await createTeam(appDb, { orgId, name: "Team", ownerId: user.id });

  await seedOnboardingMemories({
    orgId,
    teamId,
    userId: user.id,
    summary: "Team builds async interview workflows for enterprise stakeholders.",
    beliefs: ["Stakeholders prefer async interviews", "Compliance review happens weekly"],
  });

  appDb.close();
});
