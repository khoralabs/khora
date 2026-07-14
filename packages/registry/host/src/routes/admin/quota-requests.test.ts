import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRootTokenAdminAuth } from "@khoralabs/admin-token";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade-crypto";
import { ensureRegistrySchema } from "@khoralabs/registry-auth";
import {
  activateKhoraHost,
  findHostById,
  registerKhoraHost,
  requestHostTrustedOriginQuota,
} from "@khoralabs/registry-catalog";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry-sqlite";
import { initTestRegistryHostRuntime } from "../../test-helpers";
import {
  handleHostRegistryQuotaRequestDelete,
  handleHostRegistryQuotaRequestPost,
} from "../host-registry";
import {
  handleAdminHostQuotaRequestApprove,
  handleAdminHostQuotaRequestReject,
  handleAdminHostQuotaRequests,
} from "./hosts";

const ROOT_TOKEN = "test-root-token-16chars";

async function loginCookie(auth: ReturnType<typeof createRootTokenAdminAuth>): Promise<string> {
  const loginRes = await auth.route?.(
    new Request("http://x/admin/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: ROOT_TOKEN }),
    }),
    new URL("http://x/admin/api/login"),
  );
  const setCookie = loginRes?.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0] ?? "";
}

describe("operator quota requests", () => {
  const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });

  beforeEach(async () => {
    resetRegistrySqliteDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
    initTestRegistryHostRuntime(getRegistrySqliteBundle().registry);
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistrySqliteDatabase();
  });

  test("approve and reject quota requests", async () => {
    const db = getRegistrySqliteBundle().registry;
    const { host } = await activateKhoraHost(
      db,
      (await registerKhoraHost(db, { slug: "quota-host", baseUrl: "https://host.example.com" }))
        .host.id,
    );
    const pending = await requestHostTrustedOriginQuota(db, host.id, 5);
    const cookie = await loginCookie(auth);

    const listRes = await handleAdminHostQuotaRequests(
      new Request("http://localhost/admin/api/hosts/x/quota-requests", { headers: { cookie } }),
      auth,
      host.id,
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as { pending: { id: string }[] };
    expect(listJson.pending).toHaveLength(1);

    const rejectRes = await handleAdminHostQuotaRequestReject(
      new Request("http://localhost/admin/api/hosts/x/quota-requests/y/reject", {
        method: "POST",
        headers: { cookie },
      }),
      auth,
      host.id,
      pending.id,
    );
    expect(rejectRes.status).toBe(200);
    expect((await findHostById(db, host.id))?.includedTrustedOrigins).toBe(2);

    const second = await requestHostTrustedOriginQuota(db, host.id, 7);
    const approveRes = await handleAdminHostQuotaRequestApprove(
      new Request("http://localhost/admin/api/hosts/x/quota-requests/y/approve", {
        method: "POST",
        headers: { cookie },
      }),
      auth,
      host.id,
      second.id,
    );
    expect(approveRes.status).toBe(200);
    expect((await findHostById(db, host.id))?.includedTrustedOrigins).toBe(7);
  });

  test("host POST and DELETE quota requests", async () => {
    const db = getRegistrySqliteBundle().registry;
    const { host, managementToken } = await activateKhoraHost(
      db,
      (await registerKhoraHost(db, { slug: "quota-api", baseUrl: "https://host.example.com" })).host
        .id,
    );
    expect(managementToken).not.toBeNull();

    const postRes = await handleHostRegistryQuotaRequestPost(
      new Request("http://localhost/v1/hosts/quota-api/registry/quota-requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managementToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestedIncluded: 6 }),
      }),
      "quota-api",
    );
    expect(postRes.status).toBe(201);
    const postJson = (await postRes.json()) as {
      request: { id: string; requestedIncluded: number };
    };
    expect(postJson.request.requestedIncluded).toBe(6);

    const deleteRes = await handleHostRegistryQuotaRequestDelete(
      new Request("http://localhost/v1/hosts/quota-api/registry/quota-requests/x", {
        headers: { Authorization: `Bearer ${managementToken}` },
      }),
      "quota-api",
      postJson.request.id,
    );
    expect(deleteRes.status).toBe(200);
    const deleteJson = (await deleteRes.json()) as { pendingQuotaRequest: null };
    expect(deleteJson.pendingQuotaRequest).toBeNull();
    expect((await findHostById(db, host.id))?.includedTrustedOrigins).toBe(2);
  });
});
