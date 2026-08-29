import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import {
  activateKhoraHost,
  registerKhoraHost,
  verifyHostRegistrationSecret,
} from "@khoralabs/registry/catalog";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import { initTestRegistryHostRuntime } from "../test-helpers";
import { handleHostRegistrationClaim, handleHostRegistrationGet } from "./host-registration";

describe("host registration claim auth", () => {
  beforeEach(async () => {
    resetRegistrySqliteDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initRegistryDomainSchema(getRegistrySqliteBundle().registry);
    initTestRegistryHostRuntime(getRegistrySqliteBundle().registry);
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistrySqliteDatabase();
  });

  test("wrong Bearer on active pending-claim host returns 401 without managementToken", async () => {
    const db = getRegistrySqliteBundle().registry;
    const { host, registrationSecret } = await registerKhoraHost(db, {
      slug: "claim-race",
      baseUrl: "http://127.0.0.1:8788",
    });
    expect(registrationSecret).toBeDefined();
    await activateKhoraHost(db, host.id, { satisfyOperatorApproval: true });

    const res = await handleHostRegistrationGet(
      new Request("http://x/v1/hosts/claim-race/registration", {
        headers: { Authorization: "Bearer x" },
      }),
      "claim-race",
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { managementToken?: string };
    expect(body.managementToken).toBeUndefined();
  });

  test("registration secret holder receives managementToken once then secret is cleared", async () => {
    const db = getRegistrySqliteBundle().registry;
    const { host, registrationSecret } = await registerKhoraHost(db, {
      slug: "claim-ok",
      baseUrl: "http://127.0.0.1:8788",
    });
    expect(registrationSecret).toBeDefined();
    await activateKhoraHost(db, host.id, { satisfyOperatorApproval: true });

    const res = await handleHostRegistrationGet(
      new Request("http://x/v1/hosts/claim-ok/registration", {
        headers: { Authorization: `Bearer ${registrationSecret}` },
      }),
      "claim-ok",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { managementToken?: string };
    expect(typeof body.managementToken).toBe("string");
    expect(body.managementToken?.length ?? 0).toBeGreaterThan(10);

    expect(registrationSecret).toBeDefined();
    expect(await verifyHostRegistrationSecret(db, "claim-ok", registrationSecret ?? "")).toBeNull();

    const claimRes = await handleHostRegistrationClaim(
      new Request("http://x/v1/hosts/claim-ok/registration/claim", {
        method: "POST",
        headers: { Authorization: `Bearer ${registrationSecret ?? ""}` },
      }),
      "claim-ok",
    );
    expect(claimRes.status).toBe(401);
  });
});
