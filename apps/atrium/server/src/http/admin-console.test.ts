import { describe, expect, test } from "bun:test";
import { createRootTokenConsoleAuth } from "@khoralabs/atrium-console";
import type { AtriumHostContext } from "@khoralabs/atrium-host";
import { handleAdminStatsSummary } from "./admin-stats.ts";
import type { HostRouteDeps } from "./deps.ts";
import { adminStatsSummaryResponse } from "./internal-admin-stats.ts";

const ROOT_TOKEN = "test-root-token-16chars";

function withCellsDir<T>(fn: () => T): T {
  const prev = process.env.ATRIUM_CELLS_DIR;
  process.env.ATRIUM_CELLS_DIR = "/tmp/atrium-admin-console-test-cells";
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.ATRIUM_CELLS_DIR;
    else process.env.ATRIUM_CELLS_DIR = prev;
  }
}

async function withCellsDirAsync<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.ATRIUM_CELLS_DIR;
  process.env.ATRIUM_CELLS_DIR = "/tmp/atrium-admin-console-test-cells";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.ATRIUM_CELLS_DIR;
    else process.env.ATRIUM_CELLS_DIR = prev;
  }
}

function deps(consoleAuth: HostRouteDeps["consoleAuth"]): HostRouteDeps {
  const adminStats = {
    summary: () => ({
      registeredUsers: 0,
      invites: { configured: false, total: 0, consumed: 0, unconsumed: 0 },
      teardown: { pending: 0, running: 0, active: 0, completed: 0, failed: 0 },
      catalog: { projectionRows: 0, standingQueries: 0, registeredUsers: 0 },
      frames: { activeRooms: 0, totalFrames: 0 },
      cells: { poolCount: 1, inUseCount: 0, shards: [] },
      networkActivity: {
        subscriptionsThisWeek: 0,
        roomsCreatedThisWeek: 0,
        totalRoomsCreated: 0,
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
  };
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
      adminStats,
      health: { ping() {} },
    } as unknown as AtriumHostContext,
    rateLimiters: {} as HostRouteDeps["rateLimiters"],
    consoleAuth,
  };
}

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

describe("admin console auth", () => {
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
    expect(res?.headers.get("set-cookie")).toContain("atrium_console_session=");
  });

  test("admin stats returns 503 when console disabled", async () => {
    const res = await handleAdminStatsSummary(
      new Request("http://x/admin/api/stats/summary"),
      deps(null),
    );
    expect(res.status).toBe(503);
  });

  test("admin stats returns 401 without session", async () => {
    const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
    const res = await handleAdminStatsSummary(
      new Request("http://x/admin/api/stats/summary"),
      deps(auth),
    );
    expect(res.status).toBe(401);
  });

  test("admin stats returns 200 with valid session", async () => {
    await withCellsDirAsync(async () => {
      const auth = createRootTokenConsoleAuth({ rootToken: ROOT_TOKEN });
      const cookie = await loginCookie(auth);
      const res = await handleAdminStatsSummary(
        new Request("http://x/admin/api/stats/summary", { headers: { cookie } }),
        deps(auth),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { registeredUsers: number };
      expect(typeof body.registeredUsers).toBe("number");
    });
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

  test("adminStatsSummaryResponse matches internal payload shape", () => {
    withCellsDir(() => {
      const res = adminStatsSummaryResponse(deps(null));
      expect(res.status).toBe(200);
    });
  });
});
