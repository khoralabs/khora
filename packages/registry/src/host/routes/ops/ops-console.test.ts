import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { createRootTokenAdminAuth } from "@khoralabs/khora-auth";
import { linkBetterAuthUser } from "@khoralabs/khora-registry/accounts";
import { registerKhoraHost, seedDefaultHost } from "@khoralabs/khora-registry/catalog";
import { initRegistryDomainSchema } from "@khoralabs/khora-registry/persistence";
import {
  getRegistrySqliteBundle,
  resetRegistrySqliteDatabase,
} from "@khoralabs/khora-registry/sqlite";
import { initTestRegistryHostRuntime } from "../../test-helpers";
import {
  handleAdminAccountDelete,
  handleAdminAccountReactivate,
  handleAdminAccountSuspend,
} from "./accounts";
import { handleAdminHostActivate } from "./hosts";
import { handleLookupEmail } from "./lookup";

const ROOT_TOKEN = "test-root-token-16chars";

function bearerHeaders(): HeadersInit {
  return { Authorization: `Bearer ${ROOT_TOKEN}` };
}

describe("registry ops API", () => {
  const revokedUserIds: string[] = [];

  beforeEach(async () => {
    revokedUserIds.length = 0;
    resetRegistrySqliteDatabase();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    applyTestEncryptionEnv();
    await initRegistryDomainSchema(getRegistrySqliteBundle().registry);
    const db = getRegistrySqliteBundle().registry;
    initTestRegistryHostRuntime(db, {
      revokeSessionsForUser: async (userId) => {
        revokedUserIds.push(userId);
      },
    });
    await seedDefaultHost(db, {
      slug: "khora-local",
      baseUrl: "http://localhost:8788",
    });
  });

  afterEach(() => {
    delete process.env.REGISTRY_DATABASE_PATH;
    resetRegistrySqliteDatabase();
  });

  test("lookup returns 401 without Bearer", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const res = await handleLookupEmail(
      new Request("http://x/v1/ops/lookup/email"),
      new URL("http://x/v1/ops/lookup/email"),
      auth,
    );
    expect(res.status).toBe(401);
  });

  test("lookup returns 503 when ops auth disabled", async () => {
    const res = await handleLookupEmail(
      new Request("http://x/v1/ops/lookup/email", { headers: bearerHeaders() }),
      new URL("http://x/v1/ops/lookup/email"),
      null,
    );
    expect(res.status).toBe(503);
  });

  test("lookup returns 400 for missing email", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const res = await handleLookupEmail(
      new Request("http://x/v1/ops/lookup/email", { headers: bearerHeaders() }),
      new URL("http://x/v1/ops/lookup/email"),
      auth,
    );
    expect(res.status).toBe(400);
  });

  test("ops activate pending host", async () => {
    const db = getRegistrySqliteBundle().registry;
    const pending = (
      await registerKhoraHost(db, {
        slug: "pending-ops",
        baseUrl: "http://localhost:9999",
      })
    ).host;
    expect(pending.status).toBe("pending");

    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const res = await handleAdminHostActivate(
      new Request(`http://x/v1/ops/hosts/${pending.id}/activate`, {
        method: "POST",
        headers: bearerHeaders(),
      }),
      auth,
      pending.id,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { host: { status: string; slug: string } };
    expect(body.host.status).toBe("active");
    expect(body.host.slug).toBe("pending-ops");
  });

  test("ops account suspend/reactivate/delete lifecycle", async () => {
    const db = getRegistrySqliteBundle().registry;
    const account = await linkBetterAuthUser(db, {
      providerSubject: "ba-admin-lifecycle-1",
      email: "lifecycle@example.com",
    });

    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });

    const suspendRes = await handleAdminAccountSuspend(
      new Request(`http://x/v1/ops/accounts/${account.id}/suspend`, {
        method: "POST",
        headers: bearerHeaders(),
      }),
      auth,
      account.id,
    );
    expect(suspendRes.status).toBe(200);
    const suspendedBody = (await suspendRes.json()) as { account: { status: string } };
    expect(suspendedBody.account.status).toBe("suspended");
    expect(revokedUserIds).toEqual(["ba-admin-lifecycle-1"]);

    const reactivateRes = await handleAdminAccountReactivate(
      new Request(`http://x/v1/ops/accounts/${account.id}/reactivate`, {
        method: "POST",
        headers: bearerHeaders(),
      }),
      auth,
      account.id,
    );
    expect(reactivateRes.status).toBe(200);
    const reactivatedBody = (await reactivateRes.json()) as { account: { status: string } };
    expect(reactivatedBody.account.status).toBe("active");

    const deleteRes = await handleAdminAccountDelete(
      new Request(`http://x/v1/ops/accounts/${account.id}`, {
        method: "DELETE",
        headers: bearerHeaders(),
      }),
      auth,
      account.id,
    );
    expect(deleteRes.status).toBe(200);
    const deletedBody = (await deleteRes.json()) as { ok: boolean; blockedEmailsCount: number };
    expect(deletedBody.ok).toBe(true);
    expect(deletedBody.blockedEmailsCount).toBe(1);
    expect(revokedUserIds.filter((id) => id === "ba-admin-lifecycle-1")).toHaveLength(2);
  });
});
