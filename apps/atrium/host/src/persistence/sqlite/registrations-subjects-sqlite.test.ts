import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { authorSubscriptionSubject, topicSubscriptionSubject } from "../../subject-keys.ts";
import { createRegistrationsSubjectsRepo } from "./registrations-subjects-sqlite.ts";

describe("profileIdForPrincipal", () => {
  test("returns profile id after upsert", () => {
    const db = new Database(":memory:");
    const repo = createRegistrationsSubjectsRepo(db);
    repo.upsertRegistration("did:key:1", "prof-a");
    expect(repo.profileIdForPrincipal("did:key:1")).toBe("prof-a");
    expect(repo.profileIdForPrincipal("did:key:missing")).toBeUndefined();
    expect(repo.registrationExists("did:key:1")).toBe(true);
    expect(repo.registrationExists("did:key:missing")).toBe(false);
  });
});

describe("listSubjectsForPrincipal", () => {
  test("returns subjects in subscription order", () => {
    const db = new Database(":memory:");
    const repo = createRegistrationsSubjectsRepo(db);
    repo.subscribeSubject("did:key:a", topicSubscriptionSubject("rust"));
    repo.subscribeSubject("did:key:a", topicSubscriptionSubject("zig"));
    repo.subscribeSubject("did:key:a", authorSubscriptionSubject("did:key:bob"));
    expect(repo.listSubjectsForPrincipal("did:key:a").sort()).toEqual(
      ["author:did:key:bob", "topic:rust", "topic:zig"].sort(),
    );
    expect(repo.listSubjectsForPrincipal("did:key:b")).toEqual([]);
  });
});

describe("subscriberPrincipalsForSubject", () => {
  test("returns subscriber principals for a topic subject", () => {
    const db = new Database(":memory:");
    const repo = createRegistrationsSubjectsRepo(db);
    const subj = topicSubscriptionSubject("news");
    repo.subscribeSubject("did:key:alice", subj);
    repo.subscribeSubject("did:key:bob", subj);
    expect(repo.subscriberPrincipalsForSubject(subj).sort()).toEqual([
      "did:key:alice",
      "did:key:bob",
    ]);
    expect(repo.subscriberPrincipalsForSubject(subj, "did:key:alice")).toEqual(["did:key:bob"]);
  });
});
