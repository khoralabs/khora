import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  bindAgentToAccount,
  findBindingByAgentDid,
  linkBetterAuthUser,
} from "@khoralabs/khora-registry/accounts";
import { initRegistryDomainSchema } from "@khoralabs/khora-registry/persistence";
import { createRegistrySqliteDatabase } from "@khoralabs/khora-registry/sqlite";
import {
  activateKhoraHost,
  deleteKhoraHost,
  listAllHosts,
  listPublicHosts,
  listRegistryTrustedOrigins,
  reactivateKhoraHost,
  registerKhoraHost,
  replaceHostTrustedOrigins,
  setHostRegistryParticipation,
  suspendKhoraHost,
} from "./index";

describe("khora host suspend, reactivate, delete", () => {
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

  test("suspend hides host from public catalog and CORS origins", async () => {
    const { host } = await registerKhoraHost(db, {
      slug: "edge",
      baseUrl: "http://localhost:8788",
    });
    const { host: active } = await activateKhoraHost(db, host.id);
    await replaceHostTrustedOrigins(db, active.id, ["http://localhost:8788"]);
    await setHostRegistryParticipation(db, active.id, true);
    expect(await listRegistryTrustedOrigins(db)).toEqual(["http://localhost:8788"]);

    await suspendKhoraHost(db, active.id);
    expect(await listPublicHosts(db)).toHaveLength(0);
    expect(await listRegistryTrustedOrigins(db)).toHaveLength(0);
    expect(await listAllHosts(db)).toHaveLength(1);
    expect((await listAllHosts(db))[0]?.status).toBe("suspended");
  });

  test("reactivate restores public catalog and CORS origins", async () => {
    const { host } = await registerKhoraHost(db, {
      slug: "edge",
      baseUrl: "http://localhost:8788",
    });
    const { host: active } = await activateKhoraHost(db, host.id);
    await replaceHostTrustedOrigins(db, active.id, ["http://localhost:8788"]);
    await setHostRegistryParticipation(db, active.id, true);
    await suspendKhoraHost(db, active.id);

    await reactivateKhoraHost(db, active.id);
    expect(await listPublicHosts(db)).toHaveLength(1);
    expect(await listRegistryTrustedOrigins(db)).toEqual(["http://localhost:8788"]);
  });

  test("delete removes host and allows re-registration", async () => {
    const { host } = await registerKhoraHost(db, {
      slug: "gone",
      baseUrl: "http://localhost:8788",
    });
    await activateKhoraHost(db, host.id);
    const deleted = await deleteKhoraHost(db, host.id);
    expect(deleted.slug).toBe("gone");
    expect(await listAllHosts(db)).toHaveLength(0);

    const { host: again } = await registerKhoraHost(db, {
      slug: "gone",
      baseUrl: "http://localhost:8789",
    });
    expect(again.slug).toBe("gone");
  });

  test("delete clears bound_via_host_id on agent bindings", async () => {
    const { host } = await registerKhoraHost(db, {
      slug: "bind-host",
      baseUrl: "http://localhost:8788",
    });
    const { host: active } = await activateKhoraHost(db, host.id);
    const account = await linkBetterAuthUser(db, {
      providerSubject: "user-bind",
      email: "bind@test.com",
    });
    await bindAgentToAccount(db, {
      agentDid: "did:example:agent",
      accountId: account.id,
      boundViaHostId: active.id,
    });
    await deleteKhoraHost(db, active.id);
    const binding = await findBindingByAgentDid(db, "did:example:agent");
    expect(binding?.boundViaHostId).toBeNull();
  });
});
