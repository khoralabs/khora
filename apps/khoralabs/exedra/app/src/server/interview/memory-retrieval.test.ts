import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { grantSessionParticipant } from "../authz/policy";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createSession, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import {
  resolveInterviewMemoryContext,
  searchPersonalMemoriesForInterview,
} from "../interview/memory-retrieval";
import { grantPersonalMemoryAccessForSession } from "../memories/personal-memory-access";

let db: Database;

beforeEach(async () => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY = "test-memories-key-retrieval";
  db = new Database(":memory:");
  ensureExedraSchema(db);
});

afterEach(() => {
  db.close();
  delete process.env.EXEDRA_IDENTITY_KEY;
  delete process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY;
});

test("resolveInterviewMemoryContext disables personal search without consent grant", async () => {
  const owner = await getOrCreateUser(db, "owner-retrieval");
  const participant = await getOrCreateUser(db, "participant-retrieval");
  const orgId = await createOrg(db, { name: "OrgRetrieval", ownerId: owner.id });
  const teamId = createTeam(db, { orgId, name: "TeamRetrieval", ownerId: owner.id });
  const session = createSession(db, { teamId, topic: "Retrieval session" });
  grantSessionParticipant(db, participant.id, session.id);

  const withoutGrant = resolveInterviewMemoryContext(db, {
    orgId,
    teamId,
    sessionId: session.id,
    participantUserId: participant.id,
  });
  expect(withoutGrant.canSearchPersonal).toBe(false);
  expect(await searchPersonalMemoriesForInterview(withoutGrant, "topic")).toEqual([]);

  grantPersonalMemoryAccessForSession(db, {
    orgId,
    sessionId: session.id,
    userId: participant.id,
  });

  const withGrant = resolveInterviewMemoryContext(db, {
    orgId,
    teamId,
    sessionId: session.id,
    participantUserId: participant.id,
  });
  expect(withGrant.canSearchPersonal).toBe(true);
});
