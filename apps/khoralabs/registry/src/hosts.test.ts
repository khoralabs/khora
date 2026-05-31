import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRootTokenConsoleAuth } from "@khoralabs/khora-console";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import { resetUsersDatabase } from "@khoralabs/users";
import { ensureRegistrySchema } from "@khoralabs/users-auth";
import { handleAdminHostActivate } from "./api/admin/hosts";
import { handleHostGet, handleHostRegister, handleHostsList } from "./api/hosts";

const ROOT_TOKEN = "test-root-token-16chars";

async function loginCookie(auth: ReturnType<typeof createRootTokenConsoleAuth>): Promise<string> {
  const loginRes = await auth.route?.(
    new Request("http://localhost/admin/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: ROOT_TOKEN }),
    }),
    new URL("http://localhost/admin/api/login"),
  );
  const setCookie = loginRes?.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0] ?? "";
}

describe("host registry API", () => {
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

  test("register pending then activate appears in public list", async () => {
    const reg = await handleHostRegister(
      new Request("http://localhost/v1/hosts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "test-host",
          baseUrl: "http://localhost:9999",
          displayName: "Test",
        }),
      }),
    );
    expect(reg.status).toBe(201);
    const regJson = (await reg.json()) as { host: { id: string; status: string } };
    expect(regJson.host.status).toBe("pending");

    const listBefore = handleHostsList();
    expect((await listBefore.json()) as { hosts: unknown[] }).toMatchObject({ hosts: [] });

    const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    const activate = await handleAdminHostActivate(
      new Request(`http://localhost/admin/api/hosts/${regJson.host.id}/activate`, {
        method: "POST",
        headers: { cookie },
      }),
      auth,
      regJson.host.id,
    );
    expect(activate.status).toBe(200);

    const listAfter = handleHostsList();
    const hosts = (await listAfter.json()) as { hosts: { slug: string }[] };
    expect(hosts.hosts).toHaveLength(1);
    expect(hosts.hosts[0]?.slug).toBe("test-host");

    const get = handleHostGet("test-host");
    expect(get.status).toBe(200);
  });

  test("inactive host returns 404 on public get", async () => {
    const reg = await handleHostRegister(
      new Request("http://localhost/v1/hosts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "pending-only", baseUrl: "http://localhost:9998" }),
      }),
    );
    expect(reg.status).toBe(201);
    const get = handleHostGet("pending-only");
    expect(get.status).toBe(404);
  });
});
