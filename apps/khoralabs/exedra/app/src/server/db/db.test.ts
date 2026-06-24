import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { grantSessionCreatorAccess } from "../authz";
import { createIsolatedAuthzDatabase, installTestAuthzService } from "../authz/test-service";
import { getOrCreateUser } from "../identity/users";
import { consumeInvite, getInvitePublicInfo, mintSessionParticipantInvite } from "./invites";
import { ensureExedraSchema } from "./schema";
import { createOrg, createSession, createTeam } from "./sessions";

beforeAll(() => {
  process.env.INVITE_PEPPER = "test-pepper-for-invites";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

let db: Database;
let authzDb: Database;

beforeAll(async () => {
  authzDb = createIsolatedAuthzDatabase();

  installTestAuthzService(authzDb);

  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterAll(() => {
  db.close();
});

test("session invite is single-use", async () => {
  const user = await getOrCreateUser(db, "registry-user-1");
  const orgId = await createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = await createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Review",
  });
  await grantSessionCreatorAccess(user.id, session.id);

  const token = mintSessionParticipantInvite(db, {
    sessionId: session.id,
    teamId,
    createdByUserId: user.id,
  });
  const info = await getInvitePublicInfo(db, token);
  expect(info?.status).toBe("pending");

  const effects = consumeInvite(db, token, user.id);
  expect(effects).not.toBeNull();

  const infoAfter = await getInvitePublicInfo(db, token);
  expect(infoAfter?.status).toBe("accepted");

  const second = consumeInvite(db, token, user.id);
  expect(second).toBeNull();
});
