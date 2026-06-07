import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade-crypto";
import {
  getRegistryCatalogDb,
  initCatalogSchema,
  resetRegistryCatalogDb,
  seedDefaultHost,
} from "@khoralabs/registry-catalog";
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
    resetRegistryCatalogDb();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    const db = getRegistryCatalogDb();
    await initCatalogSchema(db);
    seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryCatalogDb();
  });

  test("bindAgentToAccount is idempotent for same account", () => {
    const db = getRegistryCatalogDb();
    const account = linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const did = "did:key:z6MkBindTest";

    const first = bindAgentToAccount(db, { agentDid: did, accountId: account.id });
    const second = bindAgentToAccount(db, { agentDid: did, accountId: account.id });
    expect(second.accountId).toBe(first.accountId);
  });

  test("bindAgentToAccount rejects second account", () => {
    const db = getRegistryCatalogDb();
    const a1 = linkBetterAuthUser(db, { providerSubject: "u1", email: "a@test.com" });
    const a2 = linkBetterAuthUser(db, { providerSubject: "u2", email: "b@test.com" });
    const did = "did:key:z6MkBindConflict";

    bindAgentToAccount(db, { agentDid: did, accountId: a1.id });
    expect(() => bindAgentToAccount(db, { agentDid: did, accountId: a2.id })).toThrow(
      /another account/,
    );
  });

  test("clearBindingIfNoHostLinks removes binding when no host links", () => {
    const db = getRegistryCatalogDb();
    const account = linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const host = seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    const did = "did:key:z6MkClearBind";
    bindAgentToAccount(db, { agentDid: did, accountId: account.id });
    const membership = upsertMembership(db, { accountId: account.id, hostId: host.id });
    linkAgentToMembership(db, { membershipId: membership.id, agentDid: did });

    unlinkAgentFromMembership(db, membership.id, did);
    expect(clearBindingIfNoHostLinks(db, did)).toBe(true);
    expect(findBindingByAgentDid(db, did)).toBeNull();
  });
});
