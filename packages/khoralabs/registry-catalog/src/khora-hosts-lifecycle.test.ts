import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade-crypto";
import {
  bindAgentToAccount,
  findBindingByAgentDid,
  linkBetterAuthUser,
} from "@khoralabs/registry-accounts";
import {
  activateKhoraHost,
  deleteKhoraHost,
  getRegistryCatalogDb,
  initCatalogSchema,
  listAllHosts,
  listPublicHosts,
  listRegistryTrustedOrigins,
  reactivateKhoraHost,
  registerKhoraHost,
  replaceHostTrustedOrigins,
  resetRegistryCatalogDb,
  setHostRegistryParticipation,
  suspendKhoraHost,
} from "./index";

describe("khora host suspend, reactivate, delete", () => {
  beforeEach(async () => {
    resetRegistryCatalogDb();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initCatalogSchema(getRegistryCatalogDb());
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryCatalogDb();
  });

  test("suspend hides host from public catalog and CORS origins", () => {
    const db = getRegistryCatalogDb();
    const { host } = registerKhoraHost(db, {
      slug: "edge",
      baseUrl: "http://localhost:8788",
    });
    const { host: active } = activateKhoraHost(db, host.id);
    replaceHostTrustedOrigins(db, active.id, ["http://localhost:8788"]);
    setHostRegistryParticipation(db, active.id, true);
    expect(listRegistryTrustedOrigins(db)).toEqual(["http://localhost:8788"]);

    suspendKhoraHost(db, active.id);
    expect(listPublicHosts(db)).toHaveLength(0);
    expect(listRegistryTrustedOrigins(db)).toHaveLength(0);
    expect(listAllHosts(db)).toHaveLength(1);
    expect(listAllHosts(db)[0]?.status).toBe("suspended");
  });

  test("reactivate restores public catalog and CORS origins", () => {
    const db = getRegistryCatalogDb();
    const { host } = registerKhoraHost(db, {
      slug: "edge",
      baseUrl: "http://localhost:8788",
    });
    const { host: active } = activateKhoraHost(db, host.id);
    replaceHostTrustedOrigins(db, active.id, ["http://localhost:8788"]);
    setHostRegistryParticipation(db, active.id, true);
    suspendKhoraHost(db, active.id);

    reactivateKhoraHost(db, active.id);
    expect(listPublicHosts(db)).toHaveLength(1);
    expect(listRegistryTrustedOrigins(db)).toEqual(["http://localhost:8788"]);
  });

  test("delete removes host and allows re-registration", () => {
    const db = getRegistryCatalogDb();
    const { host } = registerKhoraHost(db, {
      slug: "gone",
      baseUrl: "http://localhost:8788",
    });
    activateKhoraHost(db, host.id);
    const deleted = deleteKhoraHost(db, host.id);
    expect(deleted.slug).toBe("gone");
    expect(listAllHosts(db)).toHaveLength(0);

    const { host: again } = registerKhoraHost(db, {
      slug: "gone",
      baseUrl: "http://localhost:8789",
    });
    expect(again.slug).toBe("gone");
  });

  test("delete clears bound_via_host_id on agent bindings", () => {
    const db = getRegistryCatalogDb();
    const { host } = registerKhoraHost(db, {
      slug: "bind-host",
      baseUrl: "http://localhost:8788",
    });
    const { host: active } = activateKhoraHost(db, host.id);
    const account = linkBetterAuthUser(db, {
      providerSubject: "user-bind",
      email: "bind@test.com",
    });
    bindAgentToAccount(db, {
      agentDid: "did:example:agent",
      accountId: account.id,
      boundViaHostId: active.id,
    });
    deleteKhoraHost(db, active.id);
    const binding = findBindingByAgentDid(db, "did:example:agent");
    expect(binding?.boundViaHostId).toBeNull();
  });
});
