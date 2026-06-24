import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { grantPersonalKgReader } from "../authz/policy";
import {
  createIsolatedAuthzDatabase,
  installTestAuthzService,
  uninstallTestAuthzService,
} from "../authz/test-service";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createSession, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { userSessionScope } from "./namespaces";
import { assertInternalPersonalMemorySearchAllowed } from "./personal-memory-internal-auth";

let db: Database;
let authzDb: Database;

beforeEach(async () => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  authzDb = createIsolatedAuthzDatabase();

  installTestAuthzService(authzDb);

  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterEach(() => {
  uninstallTestAuthzService();
  authzDb.close();
  db.close();
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("assertInternalPersonalMemorySearchAllowed requires orgId for session personal namespace", async () => {
  const orgOwner = await getOrCreateUser(db, "internal-auth-owner");
  const participant = await getOrCreateUser(db, "internal-auth-participant");
  const orgId = await createOrg(db, { name: "InternalAuthOrg", ownerId: orgOwner.id });
  const teamId = await createTeam(db, { orgId, name: "InternalAuthTeam", ownerId: orgOwner.id });
  const session = createSession(db, { teamId, topic: "Internal auth" });
  const namespace = userSessionScope(participant.id, orgId, teamId, session.id);

  const missingOrg = await assertInternalPersonalMemorySearchAllowed(db, {
    userId: participant.id,
    namespace,
  });
  expect(missingOrg?.status).toBe(403);

  expect(
    await assertInternalPersonalMemorySearchAllowed(db, {
      userId: participant.id,
      namespace,
      orgId,
    }),
  ).toBeNull();

  await grantPersonalKgReader(orgId, participant.id);
  expect(
    await assertInternalPersonalMemorySearchAllowed(db, {
      userId: participant.id,
      namespace,
      orgId,
    }),
  ).toBeNull();
});
