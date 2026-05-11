import { describe, expect, test } from "bun:test";
import path from "node:path";
import z from "zod";
import { ATRIUM_BUILTIN_PLUGIN_ID } from "../atrium-plugins.ts";
import { AtriumConfigError } from "./errors.ts";
import { loadAtriumAppConfig } from "./load.ts";
import { extendAtriumAppConfig, zAtriumAppConfigBase } from "./schema.ts";

describe("loadAtriumAppConfig", () => {
  test("layers only — env wins over defaults; file absent", () => {
    const r = loadAtriumAppConfig({
      schema: zAtriumAppConfigBase,
      layers: [{ baseUrl: "http://default" }, { baseUrl: "http://env" }],
      filePath: null,
    });
    expect(r.config.baseUrl).toBe("http://env");
    expect(r.sourcePath).toBeUndefined();
    expect(r.extendsChain).toEqual([]);
  });

  test("file layer wins over env layer", () => {
    const filePath = path.resolve("/cfg/a.json");
    const r = loadAtriumAppConfig({
      schema: zAtriumAppConfigBase,
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
    const zExt = extendAtriumAppConfig({ extra: z.string() });
    const r = loadAtriumAppConfig({
      schema: zExt,
      layers: [{ extra: "v" }],
      filePath: null,
    });
    expect(r.config.extra).toBe("v");
  });

  test("AtriumConfigError formats issues", () => {
    try {
      loadAtriumAppConfig({
        schema: zAtriumAppConfigBase,
        layers: [{ baseUrl: 42 as unknown as string }],
        filePath: null,
      });
      expect(false).toBe(true);
    } catch (e) {
      expect(e).toBeInstanceOf(AtriumConfigError);
      expect((e as AtriumConfigError).message).toContain("baseUrl");
    }
  });

  test("plugin false in higher layer cancels lower layer", () => {
    const r = loadAtriumAppConfig({
      schema: zAtriumAppConfigBase,
      layers: [
        { plugins: { [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" } } },
        { plugins: { [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: false } },
      ],
      filePath: null,
    });
    expect(r.config.plugins).toBeUndefined();
  });

  test("extends/$schema stripped from output", () => {
    const r = loadAtriumAppConfig({
      schema: zAtriumAppConfigBase,
      layers: [{ $schema: "x", extends: "./y.json", baseUrl: "http://a" }],
      filePath: null,
    });
    expect("extends" in r.config).toBe(false);
    expect("$schema" in r.config).toBe(false);
  });

  test("frozen result", () => {
    const r = loadAtriumAppConfig({
      schema: zAtriumAppConfigBase,
      layers: [{ baseUrl: "http://a" }],
      filePath: null,
    });
    expect(Object.isFrozen(r.config)).toBe(true);
  });
});
