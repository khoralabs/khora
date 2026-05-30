import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/sqlite-crypto";
import {
  activateKhoraHost,
  getUsersDatabase,
  registerKhoraHost,
  resetUsersDatabase,
} from "@khoralabs/users";
import { ensureRegistrySchema } from "@khoralabs/users-auth";
import { handleHostRegistryGet, handleHostRegistryPut } from "./api/host-registry.ts";

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

  test("GET and PUT /v1/hosts/:slug/registry with management token", async () => {
    const db = getUsersDatabase();
    const pending = registerKhoraHost(db, { slug: "khora-0", baseUrl: "https://k-0.example.com" });
    const { host, managementToken } = activateKhoraHost(db, pending.id);
    expect(managementToken).not.toBeNull();

    const unauthorized = handleHostRegistryGet(
      new Request("http://localhost/v1/hosts/khora-0/registry"),
      "khora-0",
    );
    expect(unauthorized.status).toBe(401);

    const getRes = handleHostRegistryGet(
      new Request("http://localhost/v1/hosts/khora-0/registry", {
        headers: { Authorization: `Bearer ${managementToken}` },
      }),
      "khora-0",
    );
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as {
      registryParticipationEnabled: boolean;
      trustedOrigins: string[];
    };
    expect(getJson.registryParticipationEnabled).toBe(false);
    expect(getJson.trustedOrigins).toEqual([]);

    const putRes = await handleHostRegistryPut(
      new Request("http://localhost/v1/hosts/khora-0/registry", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${managementToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          participationEnabled: true,
          origins: ["https://k-0.example.com", "https://khoralabs.com"],
        }),
      }),
      "khora-0",
    );
    expect(putRes.status).toBe(200);
    const putJson = (await putRes.json()) as {
      registryParticipationEnabled: boolean;
      trustedOrigins: string[];
    };
    expect(putJson.registryParticipationEnabled).toBe(true);
    expect(putJson.trustedOrigins).toEqual(["https://k-0.example.com", "https://khoralabs.com"]);

    expect(host.slug).toBe("khora-0");
  });
});
