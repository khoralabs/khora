import { Database } from "bun:sqlite";
import { afterAll, beforeEach, expect, test } from "bun:test";
import { resetMatchmakingDomainRuntimeForTest } from "../runtime/index.ts";
import { SqliteMatchmakingDomainPersistence } from "./matchmaking-domain-persistence.ts";
import { migrateMatchmakingDomainDb } from "./migrate-domain-db.ts";
import { setMatchmakingDomainDatabaseForTest } from "./open-domain-db.ts";

const RUN_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

let db: Database;

function freshDb(): Database {
  setMatchmakingDomainDatabaseForTest(null);
  try {
    db?.close();
  } catch {
    /* ignore */
  }
  const d = new Database(":memory:", { create: true });
  migrateMatchmakingDomainDb(d);
  setMatchmakingDomainDatabaseForTest(d);
  resetMatchmakingDomainRuntimeForTest();
  db = d;
  return d;
}

beforeEach(() => {
  freshDb();
});

afterAll(() => {
  setMatchmakingDomainDatabaseForTest(null);
  try {
    db?.close();
  } catch {
    /* ignore */
  }
});

test("Profile upsert and get round-trip", () => {
  const p = new SqliteMatchmakingDomainPersistence(db);
  const a = p.upsertProfile("s1", { displayName: "A", tagline: "t", about: "x" });
  expect(a.displayName).toBe("A");
  const g = p.getProfile("s1");
  expect(g?.displayName).toBe("A");
});

test("Invite and booking outcome", () => {
  const p = new SqliteMatchmakingDomainPersistence(db);
  const i = p.createInvite({
    id: RUN_ID,
    subjectId: "s1",
    inviteePersonaSlug: "mira-patel",
    message: "hi",
  });
  expect(i.status).toBe("pending");
  p.setInviteFinished(RUN_ID, {
    status: "connected",
    offerId: "o",
    portId: "p",
    portType: "t",
    rounds: 1,
  });
  const b = p.getInvite(RUN_ID);
  expect(b?.status).toBe("finished");
});

test("Goals create/list by invite id", () => {
  const p = new SqliteMatchmakingDomainPersistence(db);
  p.createInvite({
    id: RUN_ID,
    subjectId: "s1",
    inviteePersonaSlug: "james-ortiz",
    message: "Need advice on API partnerships",
  });
  const created = p.createGoals({
    inviteId: RUN_ID,
    subjectId: "s1",
    goals: [
      { text: "Validate partner ICP", kind: "strategy" },
      { text: "Get concrete intro criteria", kind: "execution", priority: 1 },
    ],
  });
  expect(created.length).toBe(2);
  const listed = p.listGoalsByInviteId(RUN_ID);
  expect(listed.length).toBe(2);
  expect(listed.map((g) => g.text)).toEqual([
    "Validate partner ICP",
    "Get concrete intro criteria",
  ]);
});

test("Run summaries upsert/list by run id", () => {
  const p = new SqliteMatchmakingDomainPersistence(db);
  p.createInvite({
    id: RUN_ID,
    subjectId: "s1",
    inviteePersonaSlug: "sara-kim",
    message: "Can we connect?",
  });
  const a = p.upsertRunSummary({
    runId: RUN_ID,
    partySlug: "_user_",
    counterpartySlug: "sara-kim",
    summaryText: "Good fit on scope and timing.",
    fitAssessment: "Likely worth accepting.",
    keyEvidence: ["Aligned topic", "Clear next step"],
    recommendedNextStep: "Accept and share two agenda bullets.",
  });
  expect(a.partySlug).toBe("_user_");
  const b = p.upsertRunSummary({
    runId: RUN_ID,
    partySlug: "sara-kim",
    counterpartySlug: "_user_",
    summaryText: "Tentative fit; wants clearer artifact.",
    keyEvidence: ["Asked for concrete artifact"],
  });
  expect(b.partySlug).toBe("sara-kim");
  const listed = p.listRunSummariesByRunId(RUN_ID);
  expect(listed.length).toBe(2);
  expect(listed.map((s) => s.partySlug)).toEqual(["_user_", "sara-kim"]);
});
