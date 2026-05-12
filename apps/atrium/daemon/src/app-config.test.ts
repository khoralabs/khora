import { describe, expect, test } from "bun:test";
import { ATRIUM_BUILTIN_PLUGIN_ID } from "@khoralabs/atrium-client";
import { createDaemonAppConfig, parseDaemonArgv } from "./app-config.ts";

describe("parseDaemonArgv", () => {
  test("--json flips json flag", () => {
    expect(parseDaemonArgv(["--json"]).json).toBe(true);
  });
  test("--config <path> captured", () => {
    expect(parseDaemonArgv(["--config", "/p.json"]).configPath).toBe("/p.json");
  });
  test("--config=<path> captured", () => {
    expect(parseDaemonArgv(["--config=/p.json"]).configPath).toBe("/p.json");
  });
});

describe("createDaemonAppConfig", () => {
  test("inbox-buffer installer materializes; profile-sync/telemetry skipped", () => {
    const bundle = createDaemonAppConfig({
      argv: [],
      env: {
        // Sandbox HOME so auto-discovery cannot pick up the developer's real ~/.atrium/daemon.config.json.
        HOME: "/nonexistent-test-home",
        USERPROFILE: "/nonexistent-test-home",
        ATRIUM_BASE_URL: "http://x",
        ATRIUM_INBOX_BUFFER_DB: ":memory:",
        ATRIUM_PROFILE_SYNC_PATH: "p.json",
        ATRIUM_TELEMETRY_DIR: "t",
      } as NodeJS.ProcessEnv,
    });
    expect(bundle.config.baseUrl).toBe("http://x");
    expect(bundle.installers.length).toBe(1);
    expect(bundle.config.plugins).toEqual({
      [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
      [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: { dir: "t", maxFileBytes: 4 * 1024 * 1024 },
      [ATRIUM_BUILTIN_PLUGIN_ID.inboxBuffer]: { dbPath: ":memory:" },
    });
  });

  test("daemonJson precedence: --json argv > env=false default", () => {
    const sandboxedHome = {
      HOME: "/nonexistent-test-home",
      USERPROFILE: "/nonexistent-test-home",
    } as NodeJS.ProcessEnv;
    const a = createDaemonAppConfig({ argv: ["--json"], env: { ...sandboxedHome } });
    expect(a.json).toBe(true);
    const b = createDaemonAppConfig({ argv: [], env: { ...sandboxedHome } });
    expect(b.json).toBe(false);
    const c = createDaemonAppConfig({
      argv: [],
      env: { ...sandboxedHome, ATRIUM_DAEMON_JSON: "1" } as NodeJS.ProcessEnv,
    });
    expect(c.json).toBe(true);
  });
});
