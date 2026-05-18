import { describe, expect, test } from "bun:test";
import path from "node:path";
import { At2ConfigError } from "./errors.ts";
import { readAt2ConfigFileWithExtends } from "./file.ts";

function makeFs(files: Record<string, string>) {
  return {
    readFileSync(p: string): string {
      if (!(p in files)) {
        const err: NodeJS.ErrnoException = new Error(`ENOENT: ${p}`);
        err.code = "ENOENT";
        throw err;
      }
      return files[p] as string;
    },
  };
}

describe("readAt2ConfigFileWithExtends", () => {
  test("merges single file with no extends", () => {
    const root = path.resolve("/cfg/a.json");
    const fs = makeFs({ [root]: JSON.stringify({ baseUrl: "http://a" }) });
    const out = readAt2ConfigFileWithExtends(root, { fs });
    expect(out?.merged).toEqual({ baseUrl: "http://a" });
    expect(out?.chain).toEqual([root]);
  });

  test("single-string extends resolves relative to referencing file", () => {
    const base = path.resolve("/cfg/base.json");
    const child = path.resolve("/cfg/child.json");
    const fs = makeFs({
      [base]: JSON.stringify({ baseUrl: "http://base", dataDir: "/d" }),
      [child]: JSON.stringify({ extends: "./base.json", baseUrl: "http://child" }),
    });
    const out = readAt2ConfigFileWithExtends(child, { fs });
    expect(out?.merged).toEqual({ baseUrl: "http://child", dataDir: "/d" });
    expect(out?.chain).toEqual([base, child]);
  });

  test("array extends merges deepest-first", () => {
    const b1 = path.resolve("/cfg/b1.json");
    const b2 = path.resolve("/cfg/b2.json");
    const child = path.resolve("/cfg/child.json");
    const fs = makeFs({
      [b1]: JSON.stringify({ baseUrl: "http://1", dataDir: "/d1" }),
      [b2]: JSON.stringify({ baseUrl: "http://2" }),
      [child]: JSON.stringify({ extends: ["./b1.json", "./b2.json"] }),
    });
    const out = readAt2ConfigFileWithExtends(child, { fs });
    expect(out?.merged).toEqual({ baseUrl: "http://2", dataDir: "/d1" });
  });

  test("cycle detection throws At2ConfigError", () => {
    const a = path.resolve("/cfg/a.json");
    const b = path.resolve("/cfg/b.json");
    const fs = makeFs({
      [a]: JSON.stringify({ extends: "./b.json" }),
      [b]: JSON.stringify({ extends: "./a.json" }),
    });
    expect(() => readAt2ConfigFileWithExtends(a, { fs })).toThrow(At2ConfigError);
  });

  test("ENOENT throws when explicit", () => {
    const fs = makeFs({});
    expect(() =>
      readAt2ConfigFileWithExtends(path.resolve("/missing.json"), { fs, explicit: true }),
    ).toThrow(At2ConfigError);
  });

  test("ENOENT returns undefined when not explicit", () => {
    const fs = makeFs({});
    const r = readAt2ConfigFileWithExtends(path.resolve("/missing.json"), {
      fs,
      explicit: false,
    });
    expect(r).toBeUndefined();
  });

  test("invalid JSON surfaces with file path", () => {
    const p = path.resolve("/cfg/bad.json");
    const fs = makeFs({ [p]: "{ not json" });
    try {
      readAt2ConfigFileWithExtends(p, { fs });
      expect(false).toBe(true);
    } catch (e) {
      expect(e).toBeInstanceOf(At2ConfigError);
      expect((e as At2ConfigError).sourcePath).toBe(p);
    }
  });
});
