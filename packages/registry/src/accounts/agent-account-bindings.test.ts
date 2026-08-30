import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { seedDefaultHost } from "@khoralabs/khora-registry/catalog";
import { initRegistryDomainSchema } from "@khoralabs/khora-registry/persistence";
import {
  getRegistrySqliteBundle,
  resetRegistrySqliteDatabase,
} from "@khoralabs/khora-registry/sqlite";
import { linkAgentToMembership, unlinkAgentFromMembership } from "./account-agent-links";
import { linkBetterAuthUser } from "./accounts";
import {
  bindAgentToAccount,
  clearBindingIfNoHostLinks,
  findBindingByAgentDid,
} from "./agent-account-bindings";
import { upsertMembership } from "./memberships";

describe("agent account bindings", () => {
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

  test("bindAgentToAccount is idempotent for same account", async () => {
    const db = getRegistrySqliteBundle().registry;
    const account = await linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const did = "did:key:z6MkBindTest";

    const first = await bindAgentToAccount(db, { agentDid: did, accountId: account.id });
    const second = await bindAgentToAccount(db, { agentDid: did, accountId: account.id });
    expect(second.accountId).toBe(first.accountId);
  });

  test("bindAgentToAccount rejects second account", async () => {
    const db = getRegistrySqliteBundle().registry;
    const a1 = await linkBetterAuthUser(db, { providerSubject: "u1", email: "a@test.com" });
    const a2 = await linkBetterAuthUser(db, { providerSubject: "u2", email: "b@test.com" });
    const did = "did:key:z6MkBindConflict";

    await bindAgentToAccount(db, { agentDid: did, accountId: a1.id });
    await expect(bindAgentToAccount(db, { agentDid: did, accountId: a2.id })).rejects.toThrow(
      /another account/,
    );
  });

  test("clearBindingIfNoHostLinks removes binding when no host links", async () => {
    const db = getRegistrySqliteBundle().registry;
    const account = await linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const host = await seedDefaultHost(db, {
      slug: "khora-local",
      baseUrl: "http://localhost:8788",
    });
    const did = "did:key:z6MkClearBind";
    await bindAgentToAccount(db, { agentDid: did, accountId: account.id });
    const membership = await upsertMembership(db, { accountId: account.id, hostId: host.id });
    await linkAgentToMembership(db, { membershipId: membership.id, agentDid: did });

    await unlinkAgentFromMembership(db, membership.id, did);
    expect(await clearBindingIfNoHostLinks(db, did)).toBe(true);
    expect(await findBindingByAgentDid(db, did)).toBeNull();
  });
});
