import { describe, expect, test } from "bun:test";
import { KHORA_BUILTIN_PLUGIN_ID } from "../khora-plugins.ts";
import { khoraAppConfigFromEnv } from "./env.ts";

describe("khoraAppConfigFromEnv", () => {
  test("translates known env vars to KhoraAppConfigBase fields", () => {
    const env = {
      KHORA_BASE_URL: "http://example.com",
      KHORA_AGENT_KEY_PATH: "/keys/id.json",
      KHORA_DATA_DIR: "/data",
      KHORA_PROFILE_SYNC_PATH: "profile.json",
      KHORA_TELEMETRY_DIR: "telemetry",
      KHORA_TELEMETRY_MAX_BYTES: "1048576",
      KHORA_INBOX_BUFFER_DB: ":memory:",
      KHORA_DAEMON_JSON: "true",
    } as NodeJS.ProcessEnv;
    expect(khoraAppConfigFromEnv(env)).toEqual({
      baseUrl: "http://example.com",
      agentKeyPath: "/keys/id.json",
      dataDir: "/data",
      daemonJson: true,
      plugins: {
        [KHORA_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "profile.json" },
        [KHORA_BUILTIN_PLUGIN_ID.telemetry]: {
          dir: "telemetry",
          maxFileBytes: 1048576,
        },
        [KHORA_BUILTIN_PLUGIN_ID.inboxBuffer]: { dbPath: ":memory:" },
      },
    });
  });

  test("empty / unset env yields empty partial", () => {
    expect(khoraAppConfigFromEnv({} as NodeJS.ProcessEnv)).toEqual({});
  });

  test("daemonJson accepts only '1' or 'true'", () => {
    expect(khoraAppConfigFromEnv({ KHORA_DAEMON_JSON: "1" } as NodeJS.ProcessEnv).daemonJson).toBe(
      true,
    );
    expect(
      khoraAppConfigFromEnv({ KHORA_DAEMON_JSON: "no" } as NodeJS.ProcessEnv).daemonJson,
    ).toBeUndefined();
  });

  test("telemetry max bytes defaults to 4MiB when unset", () => {
    const out = khoraAppConfigFromEnv({
      KHORA_TELEMETRY_DIR: "t",
    } as NodeJS.ProcessEnv);
    expect(out.plugins?.[KHORA_BUILTIN_PLUGIN_ID.telemetry]).toEqual({
      dir: "t",
      maxFileBytes: 4 * 1024 * 1024,
    });
  });

  test("telemetry max bytes must be positive", () => {
    expect(() =>
      khoraAppConfigFromEnv({
        KHORA_TELEMETRY_DIR: "t",
        KHORA_TELEMETRY_MAX_BYTES: "-1",
      } as NodeJS.ProcessEnv),
    ).toThrow(/positive number/);
  });
});
