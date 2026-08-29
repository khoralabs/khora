import { describe, expect, test } from "bun:test";
import { createAdminTokenAuthFromEnv, createRootTokenAdminAuth } from "./index";
import { clearSessionCookie, issueSessionCookie } from "./session-cookie";

describe("admin-token", () => {
  const ROOT = "test-root-token-16chars";

  test("createRootTokenAdminAuth authenticates after login cookie", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT });
    const login = await auth.route?.(
      new Request("http://x/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ROOT }),
      }),
      new URL("http://x/admin/api/login"),
    );
    const cookie = login?.headers.get("set-cookie")?.split(";")[0] ?? "";
    const principal = await auth.authenticate(
      new Request("http://x/admin/api/stats/summary", { headers: { cookie } }),
    );
    expect(principal).toEqual({ id: "root", role: "root" });
  });

  test("authenticate accepts Authorization Bearer root token", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT });
    const principal = await auth.authenticate(
      new Request("http://x/admin/api/stats/summary", {
        headers: { Authorization: `Bearer ${ROOT}` },
      }),
    );
    expect(principal).toEqual({ id: "root", role: "root" });
  });

  test("authenticate rejects wrong Bearer token", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT });
    const principal = await auth.authenticate(
      new Request("http://x/admin/api/stats/summary", {
        headers: { Authorization: "Bearer wrong-token-not-root" },
      }),
    );
    expect(principal).toBeNull();
  });

  test("authenticate prefers valid Bearer over cookie", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT });
    const login = await auth.route?.(
      new Request("http://x/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ROOT }),
      }),
      new URL("http://x/admin/api/login"),
    );
    const cookie = login?.headers.get("set-cookie")?.split(";")[0] ?? "";
    const principal = await auth.authenticate(
      new Request("http://x/admin/api/stats/summary", {
        headers: { Authorization: `Bearer ${ROOT}`, cookie },
      }),
    );
    expect(principal).toEqual({ id: "root", role: "root" });
  });

  test("authenticate falls back to cookie when Bearer is invalid", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT });
    const login = await auth.route?.(
      new Request("http://x/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ROOT }),
      }),
      new URL("http://x/admin/api/login"),
    );
    const cookie = login?.headers.get("set-cookie")?.split(";")[0] ?? "";
    const principal = await auth.authenticate(
      new Request("http://x/admin/api/stats/summary", {
        headers: { Authorization: "Bearer wrong-token-not-root", cookie },
      }),
    );
    expect(principal).toEqual({ id: "root", role: "root" });
  });

  test("issueSessionCookie adds Secure in prod mode", () => {
    const cookie = issueSessionCookie(ROOT, { secure: true });
    expect(cookie).toContain("; Secure");
  });

  test("clearSessionCookie adds Secure when configured", () => {
    expect(clearSessionCookie({ secure: true })).toContain("; Secure");
  });

  test("login is rate limited by IP", async () => {
    const auth = createRootTokenAdminAuth({
      rootToken: ROOT,
      loginRateLimit: { windowMs: 60_000, max: 2 },
    });
    const url = new URL("http://x/admin/api/login");
    const req = () =>
      new Request(url.href, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.1" },
        body: JSON.stringify({ token: "wrong" }),
      });
    expect((await auth.route?.(req(), url))?.status).toBe(401);
    expect((await auth.route?.(req(), url))?.status).toBe(401);
    const limited = await auth.route?.(req(), url);
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("retry-after")).toBeTruthy();
  });

  test("createAdminTokenAuthFromEnv returns null without token", () => {
    const prevAdmin = process.env.ADMIN_ROOT_TOKEN;
    const prevKhora = process.env.KHORA_CONSOLE_ROOT_TOKEN;
    const prevRegistry = process.env.REGISTRY_CONSOLE_ROOT_TOKEN;
    delete process.env.ADMIN_ROOT_TOKEN;
    delete process.env.KHORA_CONSOLE_ROOT_TOKEN;
    delete process.env.REGISTRY_CONSOLE_ROOT_TOKEN;
    try {
      expect(createAdminTokenAuthFromEnv()).toBeNull();
    } finally {
      if (prevAdmin !== undefined) process.env.ADMIN_ROOT_TOKEN = prevAdmin;
      if (prevKhora !== undefined) process.env.KHORA_CONSOLE_ROOT_TOKEN = prevKhora;
      if (prevRegistry !== undefined) process.env.REGISTRY_CONSOLE_ROOT_TOKEN = prevRegistry;
    }
  });
});
