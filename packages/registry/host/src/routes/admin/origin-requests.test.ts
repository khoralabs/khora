import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade-crypto";
import { createRootTokenConsoleAuth } from "@khoralabs/khora-console";
import {
  ensureRegistrySchema,
  getRegistryDatabase,
  resetRegistryDatabase,
} from "@khoralabs/registry-auth";
import {
  activateKhoraHost,
  listHostTrustedOriginStrings,
  registerKhoraHost,
  requestHostTrustedOrigin,
} from "@khoralabs/registry-catalog";
import { initTestRegistryHostRuntime } from "../../test-helpers";
import {
  handleAdminHostOriginRequestApprove,
  handleAdminHostOriginRequestReject,
  handleAdminHostOriginRequests,
} from "./hosts";

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

describe("operator origin requests", () => {
  const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });

  beforeEach(async () => {
    resetRegistryDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
    initTestRegistryHostRuntime(getRegistryDatabase());
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistryDatabase();
  });

  test("approve and reject origin requests", async () => {
    const db = getRegistryDatabase();
    const host = activateKhoraHost(
      db,
      registerKhoraHost(db, { slug: "op-host", baseUrl: "https://host.example.com" }).host.id,
    ).host;
    const pending = requestHostTrustedOrigin(db, host.id, "https://app.example.com");
    const rejected = requestHostTrustedOrigin(db, host.id, "https://other.example.com");
    const cookie = await loginCookie(auth);

    const listRes = await handleAdminHostOriginRequests(
      new Request("http://localhost/admin/api/hosts/x/origin-requests", { headers: { cookie } }),
      auth,
      host.id,
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as { pending: { id: string }[] };
    expect(listJson.pending).toHaveLength(2);

    const rejectRes = await handleAdminHostOriginRequestReject(
      new Request("http://localhost/admin/api/hosts/x/origin-requests/y/reject", {
        method: "POST",
        headers: { cookie },
      }),
      auth,
      host.id,
      rejected.id,
    );
    expect(rejectRes.status).toBe(200);

    const approveRes = await handleAdminHostOriginRequestApprove(
      new Request("http://localhost/admin/api/hosts/x/origin-requests/y/approve", {
        method: "POST",
        headers: { cookie },
      }),
      auth,
      host.id,
      pending.id,
    );
    expect(approveRes.status).toBe(200);
    expect(listHostTrustedOriginStrings(db, host.id)).toEqual(["https://app.example.com"]);
  });
});
