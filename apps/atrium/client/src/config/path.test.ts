import { describe, expect, test } from "bun:test";
import path from "node:path";
import { defaultAtriumConfigPath, resolveAtriumConfigPath } from "./path.ts";

describe("resolveAtriumConfigPath", () => {
  test("flag wins over env and default", () => {
    const r = resolveAtriumConfigPath({
      flag: "/a.json",
      env: { ATRIUM_CONFIG: "/b.json" },
      defaultPath: "/c.json",
      fsExists: () => true,
    });
    expect(r).toEqual({ path: "/a.json", explicit: true });
  });

  test("env wins over default when no flag", () => {
    const r = resolveAtriumConfigPath({
      env: { ATRIUM_CONFIG: "/b.json" },
      defaultPath: "/c.json",
      fsExists: () => true,
    });
    expect(r).toEqual({ path: "/b.json", explicit: true });
  });

  test("default returned only when file exists", () => {
    const ok = resolveAtriumConfigPath({ defaultPath: "/c.json", fsExists: () => true });
    expect(ok).toEqual({ path: "/c.json", explicit: false });
    const missing = resolveAtriumConfigPath({ defaultPath: "/c.json", fsExists: () => false });
    expect(missing).toBeUndefined();
  });

  test("empty flag is ignored", () => {
    const r = resolveAtriumConfigPath({
      flag: "  ",
      env: { ATRIUM_CONFIG: "/b.json" },
      fsExists: () => false,
    });
    expect(r).toEqual({ path: "/b.json", explicit: true });
  });

  test("default path uses HOME", () => {
    const def = defaultAtriumConfigPath();
    expect(def.endsWith(path.join(".atrium", "config.json"))).toBe(true);
  });
});
