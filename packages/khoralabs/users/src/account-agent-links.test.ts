import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  findAgentLinkOnHost,
  linkAgentToMembership,
  listAgentLinksForMembership,
  unlinkAgentFromMembership,
} from "./account-agent-links";
import { linkBetterAuthUser } from "./accounts";
import { getUsersDatabase, resetUsersDatabase } from "./db";
import { seedDefaultHost } from "./khora-hosts";
import { findMembershipByAccountAndHost, upsertMembership } from "./memberships";
import { initUsersSchema } from "./schema";

describe("account agent links", () => {
  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    const db = getUsersDatabase();
    await initUsersSchema(db);
    seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetUsersDatabase();
  });

  test("multiple agents per membership", () => {
    const db = getUsersDatabase();
    const host = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    const account = linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const membership = upsertMembership(db, { accountId: account.id, hostId: host.id });
    const didA = "did:key:z6MkAgentA";
    const didB = "did:key:z6MkAgentB";

    linkAgentToMembership(db, { membershipId: membership.id, agentDid: didA });
    linkAgentToMembership(db, { membershipId: membership.id, agentDid: didB });

    const links = listAgentLinksForMembership(db, membership.id);
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.agentDid).sort()).toEqual([didA, didB].sort());
  });

  test("re-link same agent is idempotent", () => {
    const db = getUsersDatabase();
    const host = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    const account = linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const membership = upsertMembership(db, { accountId: account.id, hostId: host.id });
    const did = "did:key:z6MkAgentA";

    const first = linkAgentToMembership(db, { membershipId: membership.id, agentDid: did });
    const second = linkAgentToMembership(db, { membershipId: membership.id, agentDid: did });
    expect(second.id).toBe(first.id);
    expect(listAgentLinksForMembership(db, membership.id)).toHaveLength(1);
  });

  test("host-level uniqueness blocks another account", () => {
    const db = getUsersDatabase();
    const host = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    const account1 = linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const account2 = linkBetterAuthUser(db, {
      providerSubject: "user-2",
      email: "b@test.com",
    });
    const m1 = upsertMembership(db, { accountId: account1.id, hostId: host.id });
    const m2 = upsertMembership(db, { accountId: account2.id, hostId: host.id });
    const did = "did:key:z6MkSharedAgent";

    linkAgentToMembership(db, { membershipId: m1.id, agentDid: did });
    expect(() => linkAgentToMembership(db, { membershipId: m2.id, agentDid: did })).toThrow(
      /another account/,
    );
    expect(findAgentLinkOnHost(db, host.id, did)?.accountId).toBe(account1.id);
  });

  test("unlink one agent leaves others", () => {
    const db = getUsersDatabase();
    const host = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    const account = linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const membership = upsertMembership(db, { accountId: account.id, hostId: host.id });
    const didA = "did:key:z6MkAgentA";
    const didB = "did:key:z6MkAgentB";

    linkAgentToMembership(db, { membershipId: membership.id, agentDid: didA });
    linkAgentToMembership(db, { membershipId: membership.id, agentDid: didB });

    expect(unlinkAgentFromMembership(db, membership.id, didA)).toBe(true);
    const links = listAgentLinksForMembership(db, membership.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.agentDid).toBe(didB);

    const row = findMembershipByAccountAndHost(db, account.id, host.id);
    expect(row?.status).toBe("active");
  });
});
