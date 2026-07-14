import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRootTokenConsoleAuth } from "@khoralabs/admin-token";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade-crypto";
import { ensureRegistrySchema } from "@khoralabs/registry-auth";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry-sqlite";
import { initTestRegistryHostRuntime } from "../test-helpers";
import {
  handleAdminHostActivate,
  handleAdminHostDelete,
  handleAdminHostReactivate,
  handleAdminHostSuspend,
} from "./admin/hosts";
import { handleHostGet, handleHostRegister, handleHostsList } from "./hosts";

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

    const listBefore = await handleHostsList();
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

    const listAfter = await handleHostsList();
    const hosts = (await listAfter.json()) as { hosts: { slug: string }[] };
    expect(hosts.hosts).toHaveLength(1);
    expect(hosts.hosts[0]?.slug).toBe("test-host");

    const get = await handleHostGet("test-host");
    expect(get.status).toBe(200);
  });

  test("activate suspend reactivate delete lifecycle", async () => {
    const reg = await handleHostRegister(
      new Request("http://localhost/v1/hosts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "lifecycle", baseUrl: "http://localhost:9997" }),
      }),
    );
    const regJson = (await reg.json()) as { host: { id: string } };
    const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
    const cookie = await loginCookie(auth);
    const hostId = regJson.host.id;

    const activate = await handleAdminHostActivate(
      new Request(`http://localhost/admin/api/hosts/${hostId}/activate`, {
        method: "POST",
        headers: { cookie },
      }),
      auth,
      hostId,
    );
    expect(activate.status).toBe(200);

    const suspend = await handleAdminHostSuspend(
      new Request(`http://localhost/admin/api/hosts/${hostId}/suspend`, {
        method: "POST",
        headers: { cookie },
      }),
      auth,
      hostId,
    );
    expect(suspend.status).toBe(200);
    const listSuspended = (await (await handleHostsList()).json()) as { hosts: unknown[] };
    expect(listSuspended.hosts).toHaveLength(0);
    expect((await await handleHostGet("lifecycle")).status).toBe(404);

    const reactivate = await handleAdminHostReactivate(
      new Request(`http://localhost/admin/api/hosts/${hostId}/reactivate`, {
        method: "POST",
        headers: { cookie },
      }),
      auth,
      hostId,
    );
    expect(reactivate.status).toBe(200);
    const listActive = (await (await handleHostsList()).json()) as { hosts: unknown[] };
    expect(listActive.hosts).toHaveLength(1);

    const del = await handleAdminHostDelete(
      new Request(`http://localhost/admin/api/hosts/${hostId}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      auth,
      hostId,
    );
    expect(del.status).toBe(200);
    const delJson = (await del.json()) as { ok: boolean; slug: string };
    expect(delJson).toMatchObject({ ok: true, slug: "lifecycle" });
    const listAfterDelete = (await (await handleHostsList()).json()) as { hosts: unknown[] };
    expect(listAfterDelete.hosts).toHaveLength(0);
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
    const get = await handleHostGet("pending-only");
    expect(get.status).toBe(404);
  });
});
