import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  profileIdForDid,
  registrationExists,
  upsertHostRegistration,
} from "./registrations-topics-sqlite.ts";
import { ensureSwarmHostSqliteSchema } from "./schema.ts";

describe("profileIdForDid", () => {
  test("returns profile id after upsert", () => {
    const db = new Database(":memory:");
    ensureSwarmHostSqliteSchema(db);
    upsertHostRegistration(db, "did:key:1", "prof-a");
    expect(profileIdForDid(db, "did:key:1")).toBe("prof-a");
    expect(profileIdForDid(db, "did:key:missing")).toBeUndefined();
    expect(registrationExists(db, "did:key:1")).toBe(true);
    expect(registrationExists(db, "did:key:missing")).toBe(false);
  });
});
