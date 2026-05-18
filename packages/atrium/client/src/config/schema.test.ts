import { describe, expect, test } from "bun:test";
import { AT2_BUILTIN_PLUGIN_ID } from "../at2-plugins.ts";
import { extendAt2AppConfig, zAt2AppConfigBase } from "./schema.ts";

describe("zAt2AppConfigBase", () => {
  test("every documented field carries a description", () => {
    const shape = zAt2AppConfigBase.shape as Record<string, { description?: string }>;
    for (const key of Object.keys(shape)) {
      const field = shape[key];
      expect(field?.description, `${key} missing description`).toBeDefined();
    }
  });

  test("passthrough: unknown top-level keys survive", () => {
    const parsed = zAt2AppConfigBase.parse({
      baseUrl: "http://x",
      somethingElse: { foo: 1 },
    });
    expect((parsed as Record<string, unknown>).somethingElse).toEqual({ foo: 1 });
  });

  test("custom error message: invalid baseUrl", () => {
    const r = zAt2AppConfigBase.safeParse({ baseUrl: "not-a-url" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("baseUrl must be a valid URL");
    }
  });

  test("plugins map: id -> options | false", () => {
    const parsed = zAt2AppConfigBase.parse({
      plugins: {
        [AT2_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
        [AT2_BUILTIN_PLUGIN_ID.telemetry]: false,
      },
    });
    expect(parsed.plugins).toEqual({
      [AT2_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
      [AT2_BUILTIN_PLUGIN_ID.telemetry]: false,
    });
  });

  test("extends accepts string or string[]", () => {
    expect(zAt2AppConfigBase.parse({ extends: "./a.json" }).extends).toBe("./a.json");
    expect(zAt2AppConfigBase.parse({ extends: ["./a.json", "./b.json"] }).extends).toEqual([
      "./a.json",
      "./b.json",
    ]);
  });
});

describe("extendAt2AppConfig", () => {
  test("preserves base fields and adds extension fields", () => {
    const schema = extendAt2AppConfig({});
    const parsed = schema.parse({ baseUrl: "http://x" });
    expect(parsed.baseUrl).toBe("http://x");
  });
});
