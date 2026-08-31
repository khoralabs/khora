import { describe, expect, test } from "bun:test";
import { createHostRouteDepsFromEnv } from "./route-deps-from-env";

describe("createHostRouteDepsFromEnv", () => {
  test("returns null admin auth and rate limiters without root token", () => {
    const prevAdmin = process.env.ADMIN_ROOT_TOKEN;
    const prevConsole = process.env.KHORA_CONSOLE_ROOT_TOKEN;
    delete process.env.ADMIN_ROOT_TOKEN;
    delete process.env.KHORA_CONSOLE_ROOT_TOKEN;
    try {
      const { deps, adminTokenAuthEnabled } = createHostRouteDepsFromEnv({
        // Minimal stub: only fields createHostRouteDepsFromEnv reads.
        ctx: {} as never,
      });
      expect(adminTokenAuthEnabled).toBe(false);
      expect(deps.adminTokenAuth).toBeNull();
      expect(deps.rateLimiters).toBeDefined();
      expect(deps.ctx).toBeDefined();
    } finally {
      if (prevAdmin !== undefined) process.env.ADMIN_ROOT_TOKEN = prevAdmin;
      else delete process.env.ADMIN_ROOT_TOKEN;
      if (prevConsole !== undefined) process.env.KHORA_CONSOLE_ROOT_TOKEN = prevConsole;
      else delete process.env.KHORA_CONSOLE_ROOT_TOKEN;
    }
  });
});
