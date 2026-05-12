import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { authorSubscriptionSubject, topicSubscriptionSubject } from "../../subject-keys.ts";
import { createRegistrationsSubjectsRepo } from "./registrations-subjects-sqlite.ts";

describe("profileIdForDid", () => {
  test("returns profile id after upsert", () => {
    const db = new Database(":memory:");
    const repo = createRegistrationsSubjectsRepo(db);
    repo.upsertRegistration("did:key:1", "prof-a");
    expect(repo.profileIdForDid("did:key:1")).toBe("prof-a");
    expect(repo.profileIdForDid("did:key:missing")).toBeUndefined();
    expect(repo.registrationExists("did:key:1")).toBe(true);
    expect(repo.registrationExists("did:key:missing")).toBe(false);
  });
});

describe("listSubjectsForDid", () => {
  test("returns subjects in subscription order", () => {
    const db = new Database(":memory:");
    const repo = createRegistrationsSubjectsRepo(db);
    repo.subscribeSubject("did:key:a", topicSubscriptionSubject("rust"));
    repo.subscribeSubject("did:key:a", topicSubscriptionSubject("zig"));
    repo.subscribeSubject("did:key:a", authorSubscriptionSubject("did:key:bob"));
    expect(repo.listSubjectsForDid("did:key:a").sort()).toEqual(
      ["author:did:key:bob", "topic:rust", "topic:zig"].sort(),
    );
    expect(repo.listSubjectsForDid("did:key:b")).toEqual([]);
  });
});

describe("subscriberDidsForSubject", () => {
  test("returns subscriber DIDs for a topic subject", () => {
    const db = new Database(":memory:");
    const repo = createRegistrationsSubjectsRepo(db);
    const subj = topicSubscriptionSubject("news");
    repo.subscribeSubject("did:key:alice", subj);
    repo.subscribeSubject("did:key:bob", subj);
    expect(repo.subscriberDidsForSubject(subj).sort()).toEqual(["did:key:alice", "did:key:bob"]);
    expect(repo.subscriberDidsForSubject(subj, "did:key:alice")).toEqual(["did:key:bob"]);
  });
});
