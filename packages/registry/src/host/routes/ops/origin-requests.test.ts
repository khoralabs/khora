import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { createRootTokenAdminAuth } from "@khoralabs/khora-auth";
import {
  activateKhoraHost,
  listHostTrustedOriginStrings,
  registerKhoraHost,
  requestHostTrustedOrigin,
} from "@khoralabs/registry/catalog";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import { initTestRegistryHostRuntime } from "../../test-helpers";
import {
  handleAdminHostOriginRequestApprove,
  handleAdminHostOriginRequestReject,
  handleAdminHostOriginRequests,
} from "./hosts";

const ROOT_TOKEN = "test-root-token-16chars";

function bearerHeaders(): HeadersInit {
  return { Authorization: `Bearer ${ROOT_TOKEN}` };
}

describe("operator origin requests", () => {
  const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });

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

  test("approve and reject origin requests", async () => {
    const db = getRegistrySqliteBundle().registry;
    const host = (
      await activateKhoraHost(
        db,
        (
          await registerKhoraHost(db, { slug: "op-host", baseUrl: "https://host.example.com" })
        ).host.id,
      )
    ).host;
    const pending = await requestHostTrustedOrigin(db, host.id, "https://app.example.com");
    const rejected = await requestHostTrustedOrigin(db, host.id, "https://other.example.com");

    const listRes = await handleAdminHostOriginRequests(
      new Request("http://localhost/v1/ops/hosts/x/origin-requests", { headers: bearerHeaders() }),
      auth,
      host.id,
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as { pending: { id: string }[] };
    expect(listJson.pending).toHaveLength(2);

    const rejectRes = await handleAdminHostOriginRequestReject(
      new Request("http://localhost/v1/ops/hosts/x/origin-requests/y/reject", {
        method: "POST",
        headers: bearerHeaders(),
      }),
      auth,
      host.id,
      rejected.id,
    );
    expect(rejectRes.status).toBe(200);

    const approveRes = await handleAdminHostOriginRequestApprove(
      new Request("http://localhost/v1/ops/hosts/x/origin-requests/y/approve", {
        method: "POST",
        headers: bearerHeaders(),
      }),
      auth,
      host.id,
      pending.id,
    );
    expect(approveRes.status).toBe(200);
    expect(await listHostTrustedOriginStrings(db, host.id)).toEqual(["https://app.example.com"]);
  });
});
