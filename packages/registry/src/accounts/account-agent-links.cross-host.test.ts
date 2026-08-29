import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { registerKhoraHost, seedDefaultHost } from "@khoralabs/registry/catalog";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { createRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import {
  ensureAgentLinkedOnHost,
  linkAgentToAccountOnHost,
  listAgentLinksForAccount,
  propagateAgentLinksToHosts,
} from "./account-agent-links";
import { linkBetterAuthUser } from "./accounts";
import { bindAgentToAccount } from "./agent-account-bindings";

describe("cross-host agent links", () => {
  let db: ReturnType<typeof createRegistrySqliteDatabase>;
  let sqlite: Database;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    db = createRegistrySqliteDatabase(sqlite);
    await initRegistryDomainSchema(db);
  });

  afterEach(() => {
    void db.close();
    sqlite.close();
  });

  test("link on one host and propagate to another", async () => {
    const hostA = await seedDefaultHost(db, { slug: "host-a", baseUrl: "http://localhost:8788" });
    const hostB = (
      await registerKhoraHost(db, {
        slug: "host-b",
        baseUrl: "http://localhost:8789",
      })
    ).host;
    const account = await linkBetterAuthUser(db, {
      providerSubject: "user-1",
      email: "a@test.com",
    });
    const did = "did:key:z6MkCrossHost";

    await linkAgentToAccountOnHost(db, {
      accountId: account.id,
      agentDid: did,
      hostId: hostA.id,
      boundViaHostId: hostA.id,
    });

    const propagated = await propagateAgentLinksToHosts(db, {
      accountId: account.id,
      agentDid: did,
      hostIds: [hostB.id],
    });
    expect(propagated).toHaveLength(1);
    expect(propagated[0]?.ok).toBe(true);

    const links = await listAgentLinksForAccount(db, account.id);
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.hostId).sort()).toEqual([hostA.id, hostB.id].sort());
  });

  test("ensure rejects account mismatch with binding", async () => {
    const host = await seedDefaultHost(db, { slug: "host-a", baseUrl: "http://localhost:8788" });
    const a1 = await linkBetterAuthUser(db, { providerSubject: "u1", email: "a@test.com" });
    const a2 = await linkBetterAuthUser(db, { providerSubject: "u2", email: "b@test.com" });
    const did = "did:key:z6MkEnsureMismatch";

    await bindAgentToAccount(db, { agentDid: did, accountId: a1.id });
    await expect(
      ensureAgentLinkedOnHost(db, { accountId: a2.id, agentDid: did, hostId: host.id }),
    ).rejects.toThrow(/another account/);
  });
});
