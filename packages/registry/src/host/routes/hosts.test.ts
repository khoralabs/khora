import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { createRootTokenAdminAuth } from "@khoralabs/khora-auth";
import { initRegistryDomainSchema } from "@khoralabs/registry/persistence";
import { getRegistrySqliteBundle, resetRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import { initTestRegistryHostRuntime } from "../test-helpers";
import { handleHostGet, handleHostRegister, handleHostsList } from "./hosts";
import {
  handleAdminHostActivate,
  handleAdminHostDelete,
  handleAdminHostReactivate,
  handleAdminHostSuspend,
} from "./ops/hosts";

const ROOT_TOKEN = "test-root-token-16chars";

function bearerHeaders(): HeadersInit {
  return { Authorization: `Bearer ${ROOT_TOKEN}` };
}

describe("host registry API", () => {
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

    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const activate = await handleAdminHostActivate(
      new Request(`http://localhost/v1/ops/hosts/${regJson.host.id}/activate`, {
        method: "POST",
        headers: bearerHeaders(),
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
    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const hostId = regJson.host.id;

    const activate = await handleAdminHostActivate(
      new Request(`http://localhost/v1/ops/hosts/${hostId}/activate`, {
        method: "POST",
        headers: bearerHeaders(),
      }),
      auth,
      hostId,
    );
    expect(activate.status).toBe(200);

    const suspend = await handleAdminHostSuspend(
      new Request(`http://localhost/v1/ops/hosts/${hostId}/suspend`, {
        method: "POST",
        headers: bearerHeaders(),
      }),
      auth,
      hostId,
    );
    expect(suspend.status).toBe(200);
    const listSuspended = (await (await handleHostsList()).json()) as { hosts: unknown[] };
    expect(listSuspended.hosts).toHaveLength(0);
    expect((await await handleHostGet("lifecycle")).status).toBe(404);

    const reactivate = await handleAdminHostReactivate(
      new Request(`http://localhost/v1/ops/hosts/${hostId}/reactivate`, {
        method: "POST",
        headers: bearerHeaders(),
      }),
      auth,
      hostId,
    );
    expect(reactivate.status).toBe(200);
    const listActive = (await (await handleHostsList()).json()) as { hosts: unknown[] };
    expect(listActive.hosts).toHaveLength(1);

    const del = await handleAdminHostDelete(
      new Request(`http://localhost/v1/ops/hosts/${hostId}`, {
        method: "DELETE",
        headers: bearerHeaders(),
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
