import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRootTokenConsoleAuth } from "@khoralabs/khora-console";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  getUsersDatabase,
  initUsersSchema,
  type RegistryAdminSummary,
  registerKhoraHost,
  resetUsersDatabase,
  seedDefaultHost,
} from "@khoralabs/users";
import { getRegistryDatabase } from "@khoralabs/users-auth";
import { handleAdminHostActivate } from "./hosts";
import { handleLookupEmail } from "./lookup";
import { handleAdminStatsSummary } from "./stats";

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

describe("registry admin console", () => {
  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    const db = getUsersDatabase();
    await initUsersSchema(db);
    seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetUsersDatabase();
  });

  test("login rejects invalid token", async () => {
    const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
    const res = await auth.route?.(
      new Request("http://x/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "wrong" }),
      }),
      new URL("http://x/admin/api/login"),
    );
    expect(res?.status).toBe(401);
  });

  test("login accepts valid token and sets session cookie", async () => {
    const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
    const res = await auth.route?.(
      new Request("http://x/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ROOT_TOKEN }),
      }),
      new URL("http://x/admin/api/login"),
    );
    expect(res?.status).toBe(200);
    expect(res?.headers.get("set-cookie")).toContain("khora_console_session=");
  });

  test("admin stats returns 503 when console disabled", async () => {
    const res = await handleAdminStatsSummary(
      new Request("http://x/admin/api/stats/summary"),
      null,
    );
    expect(res.status).toBe(503);
  });

  test("admin stats returns 401 without session", async () => {
    const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
    const res = await handleAdminStatsSummary(
      new Request("http://x/admin/api/stats/summary"),
      auth,
    );
    expect(res.status).toBe(401);
  });

  test("admin stats returns 200 with valid session", async () => {
    const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    const res = await handleAdminStatsSummary(
      new Request("http://x/admin/api/stats/summary", { headers: { cookie } }),
      auth,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as RegistryAdminSummary;
    expect(typeof body.accounts.total).toBe("number");
    expect(typeof body.hosts.total).toBe("number");
  });

  test("lookup returns 400 for missing email", async () => {
    const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    const res = await handleLookupEmail(
      new Request("http://x/admin/api/lookup/email", { headers: { cookie } }),
      new URL("http://x/admin/api/lookup/email"),
      auth,
    );
    expect(res.status).toBe(400);
  });

  test("admin activate pending host", async () => {
    const db = getRegistryDatabase();
    const pending = registerKhoraHost(db, {
      slug: "pending-ops",
      baseUrl: "http://localhost:9999",
    }).host;
    expect(pending.status).toBe("pending");

    const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    const res = await handleAdminHostActivate(
      new Request(`http://x/admin/api/hosts/${pending.id}/activate`, {
        method: "POST",
        headers: { cookie },
      }),
      auth,
      pending.id,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { host: { status: string; slug: string } };
    expect(body.host.status).toBe("active");
    expect(body.host.slug).toBe("pending-ops");
  });

  test("session endpoint reflects authentication state", async () => {
    const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
    const unauth = await auth.route?.(
      new Request("http://x/admin/api/session"),
      new URL("http://x/admin/api/session"),
    );
    expect(unauth?.status).toBe(401);

    const cookie = await loginCookie(auth);
    const authed = await auth.route?.(
      new Request("http://x/admin/api/session", { headers: { cookie } }),
      new URL("http://x/admin/api/session"),
    );
    expect(authed?.status).toBe(200);
  });
});
