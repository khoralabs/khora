import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { grantPersonalKgReader } from "../authz/policy";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createSession, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { userSessionScope } from "./namespaces";
import { assertInternalPersonalMemorySearchAllowed } from "./personal-memory-internal-auth";

let db: Database;

beforeEach(async () => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterEach(() => {
  db.close();
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("assertInternalPersonalMemorySearchAllowed requires orgId for session personal namespace", async () => {
  const orgOwner = await getOrCreateUser(db, "internal-auth-owner");
  const participant = await getOrCreateUser(db, "internal-auth-participant");
  const orgId = await createOrg(db, { name: "InternalAuthOrg", ownerId: orgOwner.id });
  const teamId = createTeam(db, { orgId, name: "InternalAuthTeam", ownerId: orgOwner.id });
  const session = createSession(db, { teamId, topic: "Internal auth" });
  const namespace = userSessionScope(participant.id, orgId, teamId, session.id);

  const missingOrg = assertInternalPersonalMemorySearchAllowed(db, {
    userId: participant.id,
    namespace,
  });
  expect(missingOrg?.status).toBe(403);

  const missingGrant = assertInternalPersonalMemorySearchAllowed(db, {
    userId: participant.id,
    namespace,
    orgId,
  });
  expect(missingGrant?.status).toBe(403);

  grantPersonalKgReader(db, orgId, participant.id);
  expect(
    assertInternalPersonalMemorySearchAllowed(db, {
      userId: participant.id,
      namespace,
      orgId,
    }),
  ).toBeNull();
});
