import { describe, expect, test } from "bun:test";
import path from "node:path";
import { defaultAt2ConfigPath, resolveAt2ConfigPath } from "./path.ts";

describe("resolveAt2ConfigPath", () => {
  test("flag wins over env and default", () => {
    const r = resolveAt2ConfigPath({
      flag: "/a.json",
      env: { AT2_CONFIG: "/b.json" },
      defaultPath: "/c.json",
      fsExists: () => true,
    });
    expect(r).toEqual({ path: "/a.json", explicit: true });
  });

  test("env wins over default when no flag", () => {
    const r = resolveAt2ConfigPath({
      env: { AT2_CONFIG: "/b.json" },
      defaultPath: "/c.json",
      fsExists: () => true,
    });
    expect(r).toEqual({ path: "/b.json", explicit: true });
  });

  test("default returned only when file exists", () => {
    const ok = resolveAt2ConfigPath({ defaultPath: "/c.json", fsExists: () => true });
    expect(ok).toEqual({ path: "/c.json", explicit: false });
    const missing = resolveAt2ConfigPath({ defaultPath: "/c.json", fsExists: () => false });
    expect(missing).toBeUndefined();
  });

  test("empty flag is ignored", () => {
    const r = resolveAt2ConfigPath({
      flag: "  ",
      env: { AT2_CONFIG: "/b.json" },
      fsExists: () => false,
    });
    expect(r).toEqual({ path: "/b.json", explicit: true });
  });

  test("default path uses HOME", () => {
    const def = defaultAt2ConfigPath();
    expect(def.endsWith(path.join(".at2", "config.json"))).toBe(true);
  });

  test("defaultPaths returns first existing entry", () => {
    const r = resolveAt2ConfigPath({
      defaultPaths: ["/a.json", "/b.json", "/c.json"],
      fsExists: (p) => p === "/b.json" || p === "/c.json",
    });
    expect(r).toEqual({ path: "/b.json", explicit: false });
  });

  test("defaultPaths returns undefined when none exist", () => {
    const r = resolveAt2ConfigPath({
      defaultPaths: ["/a.json", "/b.json"],
      fsExists: () => false,
    });
    expect(r).toBeUndefined();
  });

  test("defaultPaths wins over defaultPath when both supplied", () => {
    const r = resolveAt2ConfigPath({
      defaultPath: "/legacy.json",
      defaultPaths: ["/new.json"],
      fsExists: () => true,
    });
    expect(r).toEqual({ path: "/new.json", explicit: false });
  });

  test("defaultPaths walks past missing entries to find the next existing one", () => {
    const r = resolveAt2ConfigPath({
      defaultPaths: ["/missing-a.json", "/missing-b.json", "/found.json"],
      fsExists: (p) => p === "/found.json",
    });
    expect(r).toEqual({ path: "/found.json", explicit: false });
  });
});
