import { describe, expect, test } from "bun:test";
import path from "node:path";
import { defaultKhoraConfigPath, resolveKhoraConfigPath } from "./path";

describe("resolveKhoraConfigPath", () => {
  test("flag wins over env and default", () => {
    const r = resolveKhoraConfigPath({
      flag: "/a.json",
      env: { KHORA_CONFIG: "/b.json" },
      defaultPath: "/c.json",
      fsExists: () => true,
    });
    expect(r).toEqual({ path: "/a.json", explicit: true });
  });

  test("env wins over default when no flag", () => {
    const r = resolveKhoraConfigPath({
      env: { KHORA_CONFIG: "/b.json" },
      defaultPath: "/c.json",
      fsExists: () => true,
    });
    expect(r).toEqual({ path: "/b.json", explicit: true });
  });

  test("default returned only when file exists", () => {
    const ok = resolveKhoraConfigPath({
      defaultPath: "/c.json",
      fsExists: () => true,
    });
    expect(ok).toEqual({ path: "/c.json", explicit: false });
    const missing = resolveKhoraConfigPath({
      defaultPath: "/c.json",
      fsExists: () => false,
    });
    expect(missing).toBeUndefined();
  });

  test("empty flag is ignored", () => {
    const r = resolveKhoraConfigPath({
      flag: "  ",
      env: { KHORA_CONFIG: "/b.json" },
      fsExists: () => false,
    });
    expect(r).toEqual({ path: "/b.json", explicit: true });
  });

  test("default path uses HOME", () => {
    const def = defaultKhoraConfigPath();
    expect(def.endsWith(path.join(".khora", "config.json"))).toBe(true);
  });

  test("defaultPaths returns first existing entry", () => {
    const r = resolveKhoraConfigPath({
      defaultPaths: ["/a.json", "/b.json", "/c.json"],
      fsExists: (p) => p === "/b.json" || p === "/c.json",
    });
    expect(r).toEqual({ path: "/b.json", explicit: false });
  });

  test("defaultPaths returns undefined when none exist", () => {
    const r = resolveKhoraConfigPath({
      defaultPaths: ["/a.json", "/b.json"],
      fsExists: () => false,
    });
    expect(r).toBeUndefined();
  });

  test("defaultPaths wins over defaultPath when both supplied", () => {
    const r = resolveKhoraConfigPath({
      defaultPath: "/legacy.json",
      defaultPaths: ["/new.json"],
      fsExists: () => true,
    });
    expect(r).toEqual({ path: "/new.json", explicit: false });
  });

  test("defaultPaths walks past missing entries to find the next existing one", () => {
    const r = resolveKhoraConfigPath({
      defaultPaths: ["/missing-a.json", "/missing-b.json", "/found.json"],
      fsExists: (p) => p === "/found.json",
    });
    expect(r).toEqual({ path: "/found.json", explicit: false });
  });
});
