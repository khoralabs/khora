import { describe, expect, test } from "bun:test";
import { createConsoleAuthFromEnv, createRootTokenConsoleAuth } from "./index.ts";

describe("khora-console", () => {
  test("createRootTokenConsoleAuth authenticates after login cookie", async () => {
    const auth = createRootTokenConsoleAuth({ rootToken: "test-root-token-16chars" });
    const login = await auth.route?.(
      new Request("http://x/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "test-root-token-16chars" }),
      }),
      new URL("http://x/admin/api/login"),
    );
    const cookie = login?.headers.get("set-cookie")?.split(";")[0] ?? "";
    const principal = await auth.authenticate(
      new Request("http://x/admin/api/stats/summary", { headers: { cookie } }),
    );
    expect(principal).toEqual({ id: "root", role: "root" });
  });

  test("createConsoleAuthFromEnv returns null without token", () => {
    const prev = process.env.ATRIUM_CONSOLE_ROOT_TOKEN;
    delete process.env.ATRIUM_CONSOLE_ROOT_TOKEN;
    try {
      expect(createConsoleAuthFromEnv()).toBeNull();
    } finally {
      if (prev !== undefined) process.env.ATRIUM_CONSOLE_ROOT_TOKEN = prev;
    }
  });
});
