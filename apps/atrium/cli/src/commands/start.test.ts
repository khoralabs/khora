import { describe, expect, test } from "bun:test";
import { resolveDaemonInvocation } from "./start.ts";

describe("resolveDaemonInvocation", () => {
  test("uses ATRIUM_DAEMON_BIN when set (published install path)", () => {
    expect(resolveDaemonInvocation({ ATRIUM_DAEMON_BIN: "/usr/local/bin/atrium-daemon" })).toEqual([
      "/usr/local/bin/atrium-daemon",
    ]);
  });

  test("trims whitespace around the env var", () => {
    expect(resolveDaemonInvocation({ ATRIUM_DAEMON_BIN: "  /opt/atrium-daemon  " })).toEqual([
      "/opt/atrium-daemon",
    ]);
  });

  test("falls back to `bun run <script>` in monorepo dev when env is unset", () => {
    const cmd = resolveDaemonInvocation({});
    expect(cmd[0]).toBe("bun");
    expect(cmd[1]).toBe("run");
    expect(cmd[2]).toMatch(/main\.ts$/);
  });

  test("falls back when env var is whitespace-only", () => {
    const cmd = resolveDaemonInvocation({ ATRIUM_DAEMON_BIN: "   " });
    expect(cmd[0]).toBe("bun");
    expect(cmd[1]).toBe("run");
  });
});
