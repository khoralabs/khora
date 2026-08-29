import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { seedDefaultHost } from "@khoralabs/registry/catalog";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import {
  findAgentLinkOnHost,
  linkAgentToMembership,
  listAgentLinksForMembership,
  unlinkAgentFromMembership,
} from "./account-agent-links";
import { linkBetterAuthUser } from "./accounts";
import { findMembershipByAccountAndHost, upsertMembership } from "./memberships";

describe("account agent links", () => {
  beforeEach(async () => {
    resetRegistrySqliteDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initRegistryDomainSchema(getRegistrySqliteBundle().registry);
    await seedDefaultHost(getRegistrySqliteBundle().registry, {
      slug: "khora-local",
      baseUrl: "http://localhost:8788",
    });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistrySqliteDatabase();
  });

  test("multiple agents per membership", async () => {
    const db = getRegistrySqliteBundle().registry;
    const host = await seedDefaultHost(db, {
      slug: "khora-local",
      baseUrl: "http://localhost:8788",
    });
    const account = await linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const membership = await upsertMembership(db, { accountId: account.id, hostId: host.id });
    const didA = "did:key:z6MkAgentA";
    const didB = "did:key:z6MkAgentB";

    await linkAgentToMembership(db, { membershipId: membership.id, agentDid: didA });
    await linkAgentToMembership(db, { membershipId: membership.id, agentDid: didB });

    const links = await listAgentLinksForMembership(db, membership.id);
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.agentDid).sort()).toEqual([didA, didB].sort());
  });

  test("re-link same agent is idempotent", async () => {
    const db = getRegistrySqliteBundle().registry;
    const host = await seedDefaultHost(db, {
      slug: "khora-local",
      baseUrl: "http://localhost:8788",
    });
    const account = await linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const membership = await upsertMembership(db, { accountId: account.id, hostId: host.id });
    const did = "did:key:z6MkAgentA";

    const first = await linkAgentToMembership(db, { membershipId: membership.id, agentDid: did });
    const second = await linkAgentToMembership(db, { membershipId: membership.id, agentDid: did });
    expect(second.id).toBe(first.id);
    expect(await listAgentLinksForMembership(db, membership.id)).toHaveLength(1);
  });

  test("host-level uniqueness blocks another account", async () => {
    const db = getRegistrySqliteBundle().registry;
    const host = await seedDefaultHost(db, {
      slug: "khora-local",
      baseUrl: "http://localhost:8788",
    });
    const account1 = await linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const account2 = await linkBetterAuthUser(db, {
      providerSubject: "user-2",
      email: "b@test.com",
    });
    const m1 = await upsertMembership(db, { accountId: account1.id, hostId: host.id });
    const m2 = await upsertMembership(db, { accountId: account2.id, hostId: host.id });
    const did = "did:key:z6MkSharedAgent";

    await linkAgentToMembership(db, { membershipId: m1.id, agentDid: did });
    await expect(linkAgentToMembership(db, { membershipId: m2.id, agentDid: did })).rejects.toThrow(
      /another account/,
    );
    expect((await findAgentLinkOnHost(db, host.id, did))?.accountId).toBe(account1.id);
  });

  test("unlink one agent leaves others", async () => {
    const db = getRegistrySqliteBundle().registry;
    const host = await seedDefaultHost(db, {
      slug: "khora-local",
      baseUrl: "http://localhost:8788",
    });
    const account = await linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const membership = await upsertMembership(db, { accountId: account.id, hostId: host.id });
    const didA = "did:key:z6MkAgentA";
    const didB = "did:key:z6MkAgentB";

    await linkAgentToMembership(db, { membershipId: membership.id, agentDid: didA });
    await linkAgentToMembership(db, { membershipId: membership.id, agentDid: didB });
    await unlinkAgentFromMembership(db, membership.id, didA);

    const links = await listAgentLinksForMembership(db, membership.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.agentDid).toBe(didB);
    expect(await findMembershipByAccountAndHost(db, account.id, host.id)).not.toBeNull();
  });
});
