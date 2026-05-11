import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createRegistrationsTopicsRepo } from "./registrations-topics-sqlite.ts";

describe("profileIdForDid", () => {
  test("returns profile id after upsert", () => {
    const db = new Database(":memory:");
    const repo = createRegistrationsTopicsRepo(db);
    repo.upsertRegistration("did:key:1", "prof-a");
    expect(repo.profileIdForDid("did:key:1")).toBe("prof-a");
    expect(repo.profileIdForDid("did:key:missing")).toBeUndefined();
    expect(repo.registrationExists("did:key:1")).toBe(true);
    expect(repo.registrationExists("did:key:missing")).toBe(false);
  });
});

describe("listTopicSlugsForDid", () => {
  test("returns slugs in subscription order", () => {
    const db = new Database(":memory:");
    const repo = createRegistrationsTopicsRepo(db);
    repo.subscribeTopic("did:key:a", "rust");
    repo.subscribeTopic("did:key:a", "zig");
    expect(repo.listTopicSlugsForDid("did:key:a")).toEqual(["rust", "zig"]);
    expect(repo.listTopicSlugsForDid("did:key:b")).toEqual([]);
  });
});
