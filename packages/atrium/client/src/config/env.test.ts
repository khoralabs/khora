import { describe, expect, test } from "bun:test";
import { ATRIUM_BUILTIN_PLUGIN_ID } from "../atrium-plugins.ts";
import { at2AppConfigFromEnv } from "./env.ts";

describe("at2AppConfigFromEnv", () => {
  test("translates known env vars to AtriumAppConfigBase fields", () => {
    const env = {
      ATRIUM_BASE_URL: "http://example.com",
      ATRIUM_AGENT_KEY_PATH: "/keys/id.json",
      ATRIUM_DATA_DIR: "/data",
      ATRIUM_PROFILE_SYNC_PATH: "profile.json",
      ATRIUM_TELEMETRY_DIR: "telemetry",
      ATRIUM_TELEMETRY_MAX_BYTES: "1048576",
      ATRIUM_INBOX_BUFFER_DB: ":memory:",
      ATRIUM_DAEMON_JSON: "true",
    } as NodeJS.ProcessEnv;
    expect(at2AppConfigFromEnv(env)).toEqual({
      baseUrl: "http://example.com",
      agentKeyPath: "/keys/id.json",
      dataDir: "/data",
      daemonJson: true,
      plugins: {
        [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "profile.json" },
        [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: {
          dir: "telemetry",
          maxFileBytes: 1048576,
        },
        [ATRIUM_BUILTIN_PLUGIN_ID.inboxBuffer]: { dbPath: ":memory:" },
      },
    });
  });

  test("empty / unset env yields empty partial", () => {
    expect(at2AppConfigFromEnv({} as NodeJS.ProcessEnv)).toEqual({});
  });

  test("daemonJson accepts only '1' or 'true'", () => {
    expect(at2AppConfigFromEnv({ ATRIUM_DAEMON_JSON: "1" } as NodeJS.ProcessEnv).daemonJson).toBe(
      true,
    );
    expect(
      at2AppConfigFromEnv({ ATRIUM_DAEMON_JSON: "no" } as NodeJS.ProcessEnv).daemonJson,
    ).toBeUndefined();
  });

  test("telemetry max bytes defaults to 4MiB when unset", () => {
    const out = at2AppConfigFromEnv({
      ATRIUM_TELEMETRY_DIR: "t",
    } as NodeJS.ProcessEnv);
    expect(out.plugins?.[ATRIUM_BUILTIN_PLUGIN_ID.telemetry]).toEqual({
      dir: "t",
      maxFileBytes: 4 * 1024 * 1024,
    });
  });

  test("telemetry max bytes must be positive", () => {
    expect(() =>
      at2AppConfigFromEnv({
        ATRIUM_TELEMETRY_DIR: "t",
        ATRIUM_TELEMETRY_MAX_BYTES: "-1",
      } as NodeJS.ProcessEnv),
    ).toThrow(/positive number/);
  });
});
