import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade-crypto";
import {
  ensureRegistrySchema,
  getRegistryDatabase,
  resetRegistryDatabase,
} from "@khoralabs/registry-auth";
import {
  activateKhoraHost,
  approveHostTrustedOriginRequest,
  listHostTrustedOriginStrings,
  registerKhoraHost,
  requestHostTrustedOrigin,
  setHostRegistryParticipation,
} from "@khoralabs/registry-catalog";
import { initTestRegistryHostRuntime } from "../test-helpers";
import {
  handleHostRegistryGet,
  handleHostRegistryOriginDelete,
  handleHostRegistryOriginRequestDelete,
  handleHostRegistryOriginRequestPost,
} from "./host-registry";

describe("host registry API", () => {
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

  test("GET and origin request flow with management token", async () => {
    const db = getRegistryDatabase();
    const pending = registerKhoraHost(db, {
      slug: "khora-0",
      baseUrl: "https://k-0.example.com",
    }).host;
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
      pendingOriginRequests: unknown[];
      pendingQuotaRequest: null;
    };
    expect(getJson.registryParticipationEnabled).toBe(false);
    expect(getJson.trustedOrigins).toEqual([]);
    expect(getJson.pendingOriginRequests).toEqual([]);
    expect(getJson.pendingQuotaRequest).toBeNull();

    const postRes = await handleHostRegistryOriginRequestPost(
      new Request("http://localhost/v1/hosts/khora-0/registry/origin-requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managementToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ origin: "https://k-0.example.com" }),
      }),
      "khora-0",
    );
    expect(postRes.status).toBe(201);
    const postJson = (await postRes.json()) as { request: { id: string; origin: string } };
    expect(postJson.request.origin).toBe("https://k-0.example.com");

    expect(listHostTrustedOriginStrings(db, host.id)).toEqual([]);

    approveHostTrustedOriginRequest(db, postJson.request.id);
    setHostRegistryParticipation(db, host.id, true);

    const getAfter = handleHostRegistryGet(
      new Request("http://localhost/v1/hosts/khora-0/registry", {
        headers: { Authorization: `Bearer ${managementToken}` },
      }),
      "khora-0",
    );
    const afterJson = (await getAfter.json()) as { trustedOrigins: string[] };
    expect(afterJson.trustedOrigins).toEqual(["https://k-0.example.com"]);

    const deleteRes = await handleHostRegistryOriginDelete(
      new Request("http://localhost/v1/hosts/khora-0/registry/origins", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${managementToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ origin: "https://k-0.example.com" }),
      }),
      "khora-0",
    );
    expect(deleteRes.status).toBe(200);
    expect(listHostTrustedOriginStrings(db, host.id)).toEqual([]);

    const request2 = requestHostTrustedOrigin(db, host.id, "https://app.example.com");
    const cancelRes = handleHostRegistryOriginRequestDelete(
      new Request("http://localhost/v1/hosts/khora-0/registry/origin-requests/x", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${managementToken}` },
      }),
      "khora-0",
      request2.id,
    );
    expect(cancelRes.status).toBe(200);
  });
});
