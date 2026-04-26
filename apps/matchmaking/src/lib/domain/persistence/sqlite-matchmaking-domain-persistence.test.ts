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
    inviteePersonaSlug: "p1",
    message: "hi",
  });
  expect(i.status).toBe("pending");
  p.setInviteFinished(RUN_ID, { status: "connected", offerId: "o", portId: "p", portType: "t", rounds: 1 });
  const b = p.getInvite(RUN_ID);
  expect(b?.status).toBe("finished");
});
