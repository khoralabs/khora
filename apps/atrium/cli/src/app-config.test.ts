import { describe, expect, test } from "bun:test";
import { ATRIUM_BUILTIN_PLUGIN_ID } from "@cfd/atrium-client";
import { createCliAppConfig, extractConfigFlagFromArgv } from "./app-config.ts";

describe("extractConfigFlagFromArgv", () => {
  test("--config <path>", () => {
    expect(extractConfigFlagFromArgv(["x", "--config", "/p.json", "--other"])).toBe("/p.json");
  });
  test("--config=<path>", () => {
    expect(extractConfigFlagFromArgv(["x", "--config=/p.json"])).toBe("/p.json");
  });
  test("missing returns undefined", () => {
    expect(extractConfigFlagFromArgv(["x", "y"])).toBeUndefined();
  });
});

describe("createCliAppConfig", () => {
  test("env-only path: profile-sync + telemetry installers materialize, inbox-buffer skipped", () => {
    const bundle = createCliAppConfig({
      argv: [],
      env: {
        ATRIUM_BASE_URL: "http://x",
        ATRIUM_PROFILE_SYNC_PATH: "p.json",
        ATRIUM_TELEMETRY_DIR: "t",
        ATRIUM_INBOX_BUFFER_DB: "b.sqlite",
      } as NodeJS.ProcessEnv,
    });
    expect(bundle.config.baseUrl).toBe("http://x");
    expect(bundle.config.plugins).toEqual({
      [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
      [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: { dir: "t", maxFileBytes: 4 * 1024 * 1024 },
      [ATRIUM_BUILTIN_PLUGIN_ID.inboxBuffer]: { dbPath: "b.sqlite" },
    });
    expect(bundle.installers.length).toBe(2);
    expect(bundle.sourcePath).toBeUndefined();
  });
});
