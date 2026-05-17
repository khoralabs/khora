import { describe, expect, test } from "bun:test";
import { AT2_BUILTIN_PLUGIN_ID } from "../at2-plugins.ts";
import { at2AppConfigFromEnv } from "./env.ts";

describe("at2AppConfigFromEnv", () => {
  test("translates known env vars to At2AppConfigBase fields", () => {
    const env = {
      AT2_BASE_URL: "http://example.com",
      AT2_AGENT_KEY_PATH: "/keys/id.json",
      AT2_DATA_DIR: "/data",
      AT2_PROFILE_SYNC_PATH: "profile.json",
      AT2_TELEMETRY_DIR: "telemetry",
      AT2_TELEMETRY_MAX_BYTES: "1048576",
      AT2_INBOX_BUFFER_DB: ":memory:",
      AT2_DAEMON_JSON: "true",
    } as NodeJS.ProcessEnv;
    expect(at2AppConfigFromEnv(env)).toEqual({
      baseUrl: "http://example.com",
      agentKeyPath: "/keys/id.json",
      dataDir: "/data",
      daemonJson: true,
      plugins: {
        [AT2_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "profile.json" },
        [AT2_BUILTIN_PLUGIN_ID.telemetry]: { dir: "telemetry", maxFileBytes: 1048576 },
        [AT2_BUILTIN_PLUGIN_ID.inboxBuffer]: { dbPath: ":memory:" },
      },
    });
  });

  test("empty / unset env yields empty partial", () => {
    expect(at2AppConfigFromEnv({} as NodeJS.ProcessEnv)).toEqual({});
  });

  test("daemonJson accepts only '1' or 'true'", () => {
    expect(at2AppConfigFromEnv({ AT2_DAEMON_JSON: "1" } as NodeJS.ProcessEnv).daemonJson).toBe(
      true,
    );
    expect(
      at2AppConfigFromEnv({ AT2_DAEMON_JSON: "no" } as NodeJS.ProcessEnv).daemonJson,
    ).toBeUndefined();
  });

  test("telemetry max bytes defaults to 4MiB when unset", () => {
    const out = at2AppConfigFromEnv({
      AT2_TELEMETRY_DIR: "t",
    } as NodeJS.ProcessEnv);
    expect(out.plugins?.[AT2_BUILTIN_PLUGIN_ID.telemetry]).toEqual({
      dir: "t",
      maxFileBytes: 4 * 1024 * 1024,
    });
  });

  test("telemetry max bytes must be positive", () => {
    expect(() =>
      at2AppConfigFromEnv({
        AT2_TELEMETRY_DIR: "t",
        AT2_TELEMETRY_MAX_BYTES: "-1",
      } as NodeJS.ProcessEnv),
    ).toThrow(/positive number/);
  });
});
