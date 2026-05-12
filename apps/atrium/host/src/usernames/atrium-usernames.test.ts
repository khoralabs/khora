import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { ensureSwarmHostSqliteSchema } from "../persistence/sqlite/schema.ts";
import { createAtriumUsernamesRepo } from "./atrium-usernames.ts";

function openTestDb(): Database {
  const db = new Database(":memory:");
  ensureSwarmHostSqliteSchema(db);
  return db;
}

describe("atrium usernames repo", () => {
  test("tryReserve succeeds once per username", () => {
    const repo = createAtriumUsernamesRepo(openTestDb());
    expect(repo.tryReserve("did:key:a", "alice")).toBe(true);
    expect(repo.tryReserve("did:key:b", "alice")).toBe(false);
  });

  test("tryReserve enforces one username per DID", () => {
    const repo = createAtriumUsernamesRepo(openTestDb());
    expect(repo.tryReserve("did:key:a", "alice")).toBe(true);
    expect(repo.tryReserve("did:key:a", "bob")).toBe(false);
  });

  test("lookup helpers", () => {
    const repo = createAtriumUsernamesRepo(openTestDb());
    repo.tryReserve("did:key:a", "alice");
    expect(repo.lookupByUsername("alice")).toEqual({ did: "did:key:a" });
    expect(repo.lookupByUsername("nope")).toBeUndefined();
    expect(repo.lookupByDid("did:key:a")).toEqual({ username: "alice" });
    expect(repo.lookupByDid("did:key:none")).toBeUndefined();
  });

  test("rename: happy path swaps atomically", () => {
    const repo = createAtriumUsernamesRepo(openTestDb());
    repo.tryReserve("did:key:a", "alice");
    expect(repo.rename("did:key:a", "alice-99")).toEqual({ ok: true });
    expect(repo.lookupByUsername("alice")).toBeUndefined();
    expect(repo.lookupByUsername("alice-99")).toEqual({ did: "did:key:a" });
    expect(repo.lookupByDid("did:key:a")).toEqual({ username: "alice-99" });
  });

  test("rename: collision rolls back; old username preserved", () => {
    const repo = createAtriumUsernamesRepo(openTestDb());
    repo.tryReserve("did:key:a", "alice");
    repo.tryReserve("did:key:b", "bob");
    const r = repo.rename("did:key:a", "bob");
    expect(r).toEqual({ ok: false, reason: "taken" });
    expect(repo.lookupByDid("did:key:a")).toEqual({ username: "alice" });
    expect(repo.lookupByDid("did:key:b")).toEqual({ username: "bob" });
  });

  test("rename: same-name is a no-op success", () => {
    const repo = createAtriumUsernamesRepo(openTestDb());
    repo.tryReserve("did:key:a", "alice");
    expect(repo.rename("did:key:a", "alice")).toEqual({ ok: true });
    expect(repo.lookupByDid("did:key:a")).toEqual({ username: "alice" });
  });

  test("rename: not_found when DID has no row", () => {
    const repo = createAtriumUsernamesRepo(openTestDb());
    expect(repo.rename("did:key:ghost", "alice")).toEqual({ ok: false, reason: "not_found" });
  });

  test("release frees the username; later reserve succeeds", () => {
    const repo = createAtriumUsernamesRepo(openTestDb());
    repo.tryReserve("did:key:a", "alice");
    repo.release("did:key:a");
    expect(repo.lookupByDid("did:key:a")).toBeUndefined();
    expect(repo.tryReserve("did:key:b", "alice")).toBe(true);
  });

  test("release is idempotent for unknown DIDs", () => {
    const repo = createAtriumUsernamesRepo(openTestDb());
    expect(() => repo.release("did:key:none")).not.toThrow();
  });
});
