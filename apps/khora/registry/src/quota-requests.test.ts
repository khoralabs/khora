import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRootTokenConsoleAuth } from "@khoralabs/khora-console";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  activateKhoraHost,
  findHostById,
  getUsersDatabase,
  registerKhoraHost,
  requestHostTrustedOriginQuota,
  resetUsersDatabase,
} from "@khoralabs/users";
import { ensureRegistrySchema } from "@khoralabs/users-auth";
import {
  handleAdminHostQuotaRequestApprove,
  handleAdminHostQuotaRequestReject,
  handleAdminHostQuotaRequests,
} from "./api/admin/hosts";
import {
  handleHostRegistryQuotaRequestDelete,
  handleHostRegistryQuotaRequestPost,
} from "./api/host-registry";

const ROOT_TOKEN = "test-root-token-16chars";

async function loginCookie(auth: ReturnType<typeof createRootTokenConsoleAuth>): Promise<string> {
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
  const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });

  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetUsersDatabase();
  });

  test("approve and reject quota requests", async () => {
    const db = getUsersDatabase();
    const { host } = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "quota-host", baseUrl: "https://host.example.com" }).host.id,
    );
    const pending = requestHostTrustedOriginQuota(db, host.id, 5);
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
    expect(findHostById(db, host.id)?.includedTrustedOrigins).toBe(2);

    const second = requestHostTrustedOriginQuota(db, host.id, 7);
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
    expect(findHostById(db, host.id)?.includedTrustedOrigins).toBe(7);
  });

  test("host POST and DELETE quota requests", async () => {
    const db = getUsersDatabase();
    const { host, managementToken } = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "quota-api", baseUrl: "https://host.example.com" }).host.id,
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

    const deleteRes = handleHostRegistryQuotaRequestDelete(
      new Request("http://localhost/v1/hosts/quota-api/registry/quota-requests/x", {
        headers: { Authorization: `Bearer ${managementToken}` },
      }),
      "quota-api",
      postJson.request.id,
    );
    expect(deleteRes.status).toBe(200);
    const deleteJson = (await deleteRes.json()) as { pendingQuotaRequest: null };
    expect(deleteJson.pendingQuotaRequest).toBeNull();
    expect(findHostById(db, host.id)?.includedTrustedOrigins).toBe(2);
  });
});
