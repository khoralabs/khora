import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRootTokenAdminAuth } from "@khoralabs/khora-auth";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import { type HostRouteDeps, handleAdminInvitesMint } from "@khoralabs/khora-host/http";
import { createKhoraInvitesSqliteRepo } from "@khoralabs/khora-host/sqlite";

const ROOT_TOKEN = "test-root-token-16chars";
const INVITE_PEPPER = "test-invite-pepper-32chars-xxxx";

describe("ops invites mint", () => {
  let db: Database;
  const adminTokenAuth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  function routeDeps(withInvites: boolean): HostRouteDeps {
    return {
      ctx: {
        invitesRepo: withInvites ? createKhoraInvitesSqliteRepo(db, INVITE_PEPPER) : undefined,
      } as unknown as KhoraHostContext,
      rateLimiters: {} as HostRouteDeps["rateLimiters"],
      adminTokenAuth,
    };
  }

  test("POST /v1/ops/invites/mint with Bearer returns tokens", async () => {
    const res = await handleAdminInvitesMint(
      new Request("http://x/v1/ops/invites/mint", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ROOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ count: 1 }),
      }),
      routeDeps(true),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; tokens: string[] };
    expect(body.ok).toBe(true);
    expect(body.tokens).toHaveLength(1);
    expect(typeof body.tokens[0]).toBe("string");
    expect(body.tokens[0]?.length).toBeGreaterThan(0);
  });

  test("POST /v1/ops/invites/mint rejects missing auth", async () => {
    const res = await handleAdminInvitesMint(
      new Request("http://x/v1/ops/invites/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 1 }),
      }),
      routeDeps(true),
    );
    expect(res.status).toBe(401);
  });
});
