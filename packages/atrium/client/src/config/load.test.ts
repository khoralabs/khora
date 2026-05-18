import { describe, expect, test } from "bun:test";
import path from "node:path";
import z from "zod";
import { AT2_BUILTIN_PLUGIN_ID } from "../at2-plugins.ts";
import { At2ConfigError } from "./errors.ts";
import { loadAt2AppConfig } from "./load.ts";
import { extendAt2AppConfig, zAt2AppConfigBase } from "./schema.ts";

describe("loadAt2AppConfig", () => {
  test("layers only — env wins over defaults; file absent", () => {
    const r = loadAt2AppConfig({
      schema: zAt2AppConfigBase,
      layers: [{ baseUrl: "http://default" }, { baseUrl: "http://env" }],
      filePath: null,
    });
    expect(r.config.baseUrl).toBe("http://env");
    expect(r.sourcePath).toBeUndefined();
    expect(r.extendsChain).toEqual([]);
  });

  test("file layer wins over env layer", () => {
    const filePath = path.resolve("/cfg/a.json");
    const r = loadAt2AppConfig({
      schema: zAt2AppConfigBase,
      layers: [{ baseUrl: "http://env" }],
      filePath,
      fs: {
        readFileSync(p: string): string {
          if (p === filePath) return JSON.stringify({ baseUrl: "http://file" });
          const err: NodeJS.ErrnoException = new Error("ENOENT");
          err.code = "ENOENT";
          throw err;
        },
      },
    });
    expect(r.config.baseUrl).toBe("http://file");
    expect(r.sourcePath).toBe(filePath);
  });

  test("extended schema can require new keys", () => {
    const zExt = extendAt2AppConfig({ extra: z.string() });
    const r = loadAt2AppConfig({
      schema: zExt,
      layers: [{ extra: "v" }],
      filePath: null,
    });
    expect(r.config.extra).toBe("v");
  });

  test("At2ConfigError formats issues", () => {
    try {
      loadAt2AppConfig({
        schema: zAt2AppConfigBase,
        layers: [{ baseUrl: 42 as unknown as string }],
        filePath: null,
      });
      expect(false).toBe(true);
    } catch (e) {
      expect(e).toBeInstanceOf(At2ConfigError);
      expect((e as At2ConfigError).message).toContain("baseUrl");
    }
  });

  test("plugin false in higher layer cancels lower layer", () => {
    const r = loadAt2AppConfig({
      schema: zAt2AppConfigBase,
      layers: [
        { plugins: { [AT2_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" } } },
        { plugins: { [AT2_BUILTIN_PLUGIN_ID.profileSync]: false } },
      ],
      filePath: null,
    });
    expect(r.config.plugins).toBeUndefined();
  });

  test("extends/$schema stripped from output", () => {
    const r = loadAt2AppConfig({
      schema: zAt2AppConfigBase,
      layers: [{ $schema: "x", extends: "./y.json", baseUrl: "http://a" }],
      filePath: null,
    });
    expect("extends" in r.config).toBe(false);
    expect("$schema" in r.config).toBe(false);
  });

  test("frozen result", () => {
    const r = loadAt2AppConfig({
      schema: zAt2AppConfigBase,
      layers: [{ baseUrl: "http://a" }],
      filePath: null,
    });
    expect(Object.isFrozen(r.config)).toBe(true);
  });
});
