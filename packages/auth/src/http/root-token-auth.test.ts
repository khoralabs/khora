import { describe, expect, test } from "bun:test";
import { createAdminTokenAuthFromEnv, createRootTokenAdminAuth } from "./root-token-auth";
import { clearSessionCookie, issueSessionCookie } from "./session-cookie";

describe("admin-token", () => {
  const ROOT = "test-root-token-16chars";

  test("authenticate accepts Authorization Bearer root token", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT });
    const principal = await auth.authenticate(
      new Request("http://x/v1/ops/lookup/email", {
        headers: { Authorization: `Bearer ${ROOT}` },
      }),
    );
    expect(principal).toEqual({ id: "root", role: "root" });
  });

  test("authenticate rejects wrong Bearer token", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT });
    const principal = await auth.authenticate(
      new Request("http://x/v1/ops/lookup/email", {
        headers: { Authorization: "Bearer wrong-token-not-root" },
      }),
    );
    expect(principal).toBeNull();
  });

  test("authenticate rejects missing Bearer", async () => {
    const auth = createRootTokenAdminAuth({ rootToken: ROOT });
    const principal = await auth.authenticate(new Request("http://x/v1/ops/lookup/email"));
    expect(principal).toBeNull();
  });

  test("issueSessionCookie adds Secure in prod mode", () => {
    const cookie = issueSessionCookie(ROOT, { secure: true });
    expect(cookie).toContain("; Secure");
  });

  test("clearSessionCookie adds Secure when configured", () => {
    expect(clearSessionCookie({ secure: true })).toContain("; Secure");
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
