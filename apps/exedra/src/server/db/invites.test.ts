import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { getOrCreateUser } from "../identity/users";
import { consumeSessionInvite, getInviteSessionId, mintSessionInvite } from "./invites";
import { ensureExedraSchema } from "./schema";
import {
  addSessionParticipants,
  createOrg,
  createSession,
  createTeam,
  userHasSessionAccess,
} from "./sessions";

beforeAll(() => {
  process.env.INVITE_PEPPER = "test-pepper-for-invites";
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

let db: Database;

beforeAll(async () => {
  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterAll(() => {
  db.close();
});

test("getInviteSessionId resolves session for token", async () => {
  const user = await getOrCreateUser(db, "registry-user-invite-session");
  const orgId = createOrg(db, { name: "Org", ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, {
    teamId,
    topic: "Review",
    facilitatorId: user.id,
  });

  const token = mintSessionInvite(db, session.id);
  expect(getInviteSessionId(db, token)).toBe(session.id);
});

test("user with session access is treated as already joined", async () => {
  const facilitator = await getOrCreateUser(db, "registry-facilitator");
  const participant = await getOrCreateUser(db, "registry-participant");
  const orgId = createOrg(db, { name: "Org2", ownerId: facilitator.id });
  const teamId = createTeam(db, { orgId, name: "Team2", ownerId: facilitator.id });
  const session = createSession(db, {
    teamId,
    topic: "Alignment",
    facilitatorId: facilitator.id,
  });

  const token = mintSessionInvite(db, session.id);
  consumeSessionInvite(db, token, participant.id);
  addSessionParticipants(db, session.id, [participant.id]);

  expect(userHasSessionAccess(db, session.id, participant.id)).toBe(true);

  const secondConsume = consumeSessionInvite(db, token, participant.id);
  expect(secondConsume).toBeNull();
});
