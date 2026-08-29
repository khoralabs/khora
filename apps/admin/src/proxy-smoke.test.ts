import { describe, expect, test } from "bun:test";
import { createRootTokenAdminAuth } from "@khoralabs/khora-auth";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import {
  createHostRouter,
  createV2HostRateLimiters,
  type HostRouteDeps,
} from "@khoralabs/khora-host/http";

const ROOT_TOKEN = "test-root-token-16chars";

function mockDeps(adminTokenAuth: HostRouteDeps["adminTokenAuth"]): HostRouteDeps {
  return {
    ctx: {
      tenantKey: "relay",
      cellPoolCount: 1,
      cluster: {
        cellPoolCount: 1,
        assignPrincipalToCell: () => "colonnade-shard-0",
        resolveCell: () => {
          throw new Error("not used");
        },
        close: () => {},
      },
      adminStats: {
        summary: () => ({
          registeredUsers: 0,
          invites: { configured: false, total: 0, consumed: 0, unconsumed: 0 },
          teardown: { pending: 0, running: 0, active: 0, completed: 0, failed: 0 },
          catalog: { projectionRows: 0, standingQueries: 0, registeredUsers: 0 },
          cells: { poolCount: 1, inUseCount: 0, shards: [] },
          networkActivity: {
            subscriptionsThisWeek: 0,
            heartbeat: {
              registeredAgents: 0,
              withStatusPost: 0,
              activeLast24h: 0,
              activeLast7d: 0,
              silent7dPlus: 0,
            },
          },
        }),
        cellDetail: () => ({ error: "invalid_cell" as const }),
        principalDetail: () => ({ error: "not_registered" as const }),
        inactiveMembers: () => ({ inactiveDays: 7, asOfMs: Date.now(), members: [] }),
        registeredPrincipalCount: () => 0,
      },
      health: { ping() {} },
    } as unknown as KhoraHostContext,
    rateLimiters: createV2HostRateLimiters(),
    adminTokenAuth,
  };
}

describe("admin api proxy smoke", () => {
  test("login + session via proxied /admin/api", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });
    const deps = mockDeps(auth);
    const { route } = createHostRouter();

    const host = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        return (
          (await route(req, url, undefined, deps)) ?? new Response("Not found", { status: 404 })
        );
      },
    });

    const hostOrigin = `http://127.0.0.1:${host.port}`;

    const admin = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/admin/api" || url.pathname.startsWith("/admin/api/")) {
          const target = new URL(url.pathname + url.search, hostOrigin);
          const headers = new Headers(req.headers);
          headers.delete("host");
          return fetch(target, {
            method: req.method,
            headers,
            body:
              req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
            redirect: "manual",
          });
        }
        return new Response("Not found", { status: 404 });
      },
    });

    try {
      const adminOrigin = `http://127.0.0.1:${admin.port}`;

      const loginRes = await fetch(`${adminOrigin}/admin/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ROOT_TOKEN }),
      });
      expect(loginRes.status).toBe(200);
      const setCookie = loginRes.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("admin_token_session=");
      const cookie = setCookie.split(";")[0] ?? "";

      const sessionRes = await fetch(`${adminOrigin}/admin/api/session`, {
        headers: { cookie },
      });
      expect(sessionRes.status).toBe(200);
    } finally {
      admin.stop(true);
      host.stop(true);
    }
  });
});
