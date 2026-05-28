import { describe, expect, test } from "bun:test";
import path from "node:path";
import z from "zod";
import { ATRIUM_BUILTIN_PLUGIN_ID } from "../khora-plugins.ts";
import { KhoraConfigError } from "./errors.ts";
import { loadKhoraAppConfig } from "./load.ts";
import { extendKhoraAppConfig, zKhoraAppConfigBase } from "./schema.ts";

describe("loadKhoraAppConfig", () => {
  test("layers only — env wins over defaults; file absent", () => {
    const r = loadKhoraAppConfig({
      schema: zKhoraAppConfigBase,
      layers: [{ baseUrl: "http://default" }, { baseUrl: "http://env" }],
      filePath: null,
    });
    expect(r.config.baseUrl).toBe("http://env");
    expect(r.sourcePath).toBeUndefined();
    expect(r.extendsChain).toEqual([]);
  });

  test("file layer wins over env layer", () => {
    const filePath = path.resolve("/cfg/a.json");
    const r = loadKhoraAppConfig({
      schema: zKhoraAppConfigBase,
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
    const zExt = extendKhoraAppConfig({ extra: z.string() });
    const r = loadKhoraAppConfig({
      schema: zExt,
      layers: [{ extra: "v" }],
      filePath: null,
    });
    expect(r.config.extra).toBe("v");
  });

  test("KhoraConfigError formats issues", () => {
    try {
      loadKhoraAppConfig({
        schema: zKhoraAppConfigBase,
        layers: [{ baseUrl: 42 as unknown as string }],
        filePath: null,
      });
      expect(false).toBe(true);
    } catch (e) {
      expect(e).toBeInstanceOf(KhoraConfigError);
      expect((e as KhoraConfigError).message).toContain("baseUrl");
    }
  });

  test("plugin false in higher layer cancels lower layer", () => {
    const r = loadKhoraAppConfig({
      schema: zKhoraAppConfigBase,
      layers: [
        {
          plugins: {
            [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
          },
        },
        { plugins: { [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: false } },
      ],
      filePath: null,
    });
    expect(r.config.plugins).toBeUndefined();
  });

  test("extends/$schema stripped from output", () => {
    const r = loadKhoraAppConfig({
      schema: zKhoraAppConfigBase,
      layers: [{ $schema: "x", extends: "./y.json", baseUrl: "http://a" }],
      filePath: null,
    });
    expect("extends" in r.config).toBe(false);
    expect("$schema" in r.config).toBe(false);
  });

  test("frozen result", () => {
    const r = loadKhoraAppConfig({
      schema: zKhoraAppConfigBase,
      layers: [{ baseUrl: "http://a" }],
      filePath: null,
    });
    expect(Object.isFrozen(r.config)).toBe(true);
  });
});
