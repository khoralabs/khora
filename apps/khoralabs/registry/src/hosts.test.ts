import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import { resetUsersDatabase } from "@khoralabs/users";
import { ensureRegistrySchema } from "@khoralabs/users-auth";
import {
  handleHostGet,
  handleHostRegister,
  handleHostsList,
  handleInternalHostActivate,
} from "./api/hosts";

describe("host registry API", () => {
  const internalSecret = "test-registry-internal-secret-32chars";

  beforeEach(async () => {
    resetUsersDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    process.env.REGISTRY_INTERNAL_SECRET = internalSecret;
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    delete process.env.REGISTRY_INTERNAL_SECRET;
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

    const activate = await handleInternalHostActivate(
      new Request("http://localhost/internal/v1/hosts/x/activate", {
        method: "POST",
        headers: { Authorization: `Bearer ${internalSecret}` },
      }),
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
