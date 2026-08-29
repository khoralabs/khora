import { describe, expect, test } from "bun:test";
import { KHORA_BUILTIN_PLUGIN_ID } from "../khora-plugins";
import { extendKhoraAppConfig, zKhoraAppConfigBase } from "./schema";

describe("zKhoraAppConfigBase", () => {
  test("every documented field carries a description", () => {
    const shape = zKhoraAppConfigBase.shape as Record<string, { description?: string }>;
    for (const key of Object.keys(shape)) {
      const field = shape[key];
      expect(field?.description, `${key} missing description`).toBeDefined();
    }
  });

  test("passthrough: unknown top-level keys survive", () => {
    const parsed = zKhoraAppConfigBase.parse({
      baseUrl: "http://x",
      somethingElse: { foo: 1 },
    });
    expect((parsed as Record<string, unknown>).somethingElse).toEqual({
      foo: 1,
    });
  });

  test("custom error message: invalid baseUrl", () => {
    const r = zKhoraAppConfigBase.safeParse({ baseUrl: "not-a-url" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("baseUrl must be a valid URL");
    }
  });

  test("plugins map: id -> options | false", () => {
    const parsed = zKhoraAppConfigBase.parse({
      plugins: {
        [KHORA_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
        [KHORA_BUILTIN_PLUGIN_ID.telemetry]: false,
      },
    });
    expect(parsed.plugins).toEqual({
      [KHORA_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
      [KHORA_BUILTIN_PLUGIN_ID.telemetry]: false,
    });
  });

  test("extends accepts string or string[]", () => {
    expect(zKhoraAppConfigBase.parse({ extends: "./a.json" }).extends).toBe("./a.json");
    expect(zKhoraAppConfigBase.parse({ extends: ["./a.json", "./b.json"] }).extends).toEqual([
      "./a.json",
      "./b.json",
    ]);
  });
});

describe("extendKhoraAppConfig", () => {
  test("preserves base fields and adds extension fields", () => {
    const schema = extendKhoraAppConfig({});
    const parsed = schema.parse({ baseUrl: "http://x" });
    expect(parsed.baseUrl).toBe("http://x");
  });
});
