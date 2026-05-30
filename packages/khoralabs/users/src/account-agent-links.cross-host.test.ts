import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  ensureAgentLinkedOnHost,
  linkAgentToAccountOnHost,
  listAgentLinksForAccount,
  propagateAgentLinksToHosts,
} from "./account-agent-links";
import { linkBetterAuthUser } from "./accounts";
import { bindAgentToAccount } from "./agent-account-bindings";
import { getUsersDatabase, resetUsersDatabase } from "./db";
import { registerKhoraHost, seedDefaultHost } from "./khora-hosts";
import { initUsersSchema } from "./schema";

describe("cross-host agent links", () => {
  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    const db = getUsersDatabase();
    await initUsersSchema(db);
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetUsersDatabase();
  });

  test("link on one host and propagate to another", () => {
    const db = getUsersDatabase();
    const hostA = seedDefaultHost(db, { slug: "host-a", baseUrl: "http://localhost:8788" });
    const hostB = registerKhoraHost(db, {
      slug: "host-b",
      baseUrl: "http://localhost:8789",
    });
    const account = linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const did = "did:key:z6MkCrossHost";

    linkAgentToAccountOnHost(db, {
      accountId: account.id,
      agentDid: did,
      hostId: hostA.id,
      boundViaHostId: hostA.id,
    });

    const propagated = propagateAgentLinksToHosts(db, {
      accountId: account.id,
      agentDid: did,
      hostIds: [hostB.id],
    });
    expect(propagated).toHaveLength(1);
    expect(propagated[0]?.ok).toBe(true);

    const links = listAgentLinksForAccount(db, account.id);
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.hostId).sort()).toEqual([hostA.id, hostB.id].sort());
  });

  test("ensure rejects account mismatch with binding", () => {
    const db = getUsersDatabase();
    const host = seedDefaultHost(db, { slug: "host-a", baseUrl: "http://localhost:8788" });
    const a1 = linkBetterAuthUser(db, { providerSubject: "u1", email: "a@test.com" });
    const a2 = linkBetterAuthUser(db, { providerSubject: "u2", email: "b@test.com" });
    const did = "did:key:z6MkEnsureMismatch";

    bindAgentToAccount(db, { agentDid: did, accountId: a1.id });
    expect(() =>
      ensureAgentLinkedOnHost(db, { accountId: a2.id, agentDid: did, hostId: host.id }),
    ).toThrow(/another account/);
  });
});
