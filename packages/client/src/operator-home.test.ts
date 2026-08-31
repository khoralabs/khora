import { describe, expect, test } from "bun:test";
import {
  DEFAULT_KHORA_BASE_URL,
  defaultIdentityPath,
  defaultKhoraDataDir,
  resolveKhoraDataDir,
} from "./operator-home";

describe("operator-home", () => {
  test("DEFAULT_KHORA_BASE_URL is local host default", () => {
    expect(DEFAULT_KHORA_BASE_URL).toBe("http://127.0.0.1:8787");
  });

  test("defaultIdentityPath prefers KHORA_AGENT_KEY_PATH", () => {
    expect(defaultIdentityPath({ KHORA_AGENT_KEY_PATH: "/tmp/id.json" })).toBe("/tmp/id.json");
  });

  test("defaultIdentityPath ignores empty override", () => {
    expect(defaultIdentityPath({ KHORA_AGENT_KEY_PATH: "  ", HOME: "/home/op" })).toBe(
      "/home/op/.khora/identity.json",
    );
  });

  test("resolveKhoraDataDir prefers config then env then default", () => {
    expect(resolveKhoraDataDir({ dataDir: "/cfg/data" }, {})).toBe("/cfg/data");
    expect(resolveKhoraDataDir({}, { KHORA_DATA_DIR: "/env/data" })).toBe("/env/data");
    expect(resolveKhoraDataDir({}, { HOME: "/home/op" })).toBe("/home/op/.khora/data");
  });

  test("defaultKhoraDataDir uses HOME", () => {
    expect(defaultKhoraDataDir({ HOME: "/home/op" })).toBe("/home/op/.khora/data");
  });
});
