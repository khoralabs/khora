import { describe, expect, test } from "bun:test";
import { ATRIUM_BUILTIN_PLUGIN_ID } from "../atrium-plugins.ts";
import { extendAtriumAppConfig, zAtriumAppConfigBase } from "./schema.ts";

describe("zAtriumAppConfigBase", () => {
  test("every documented field carries a description", () => {
    const shape = zAtriumAppConfigBase.shape as Record<string, { description?: string }>;
    for (const key of Object.keys(shape)) {
      const field = shape[key];
      expect(field?.description, `${key} missing description`).toBeDefined();
    }
  });

  test("passthrough: unknown top-level keys survive", () => {
    const parsed = zAtriumAppConfigBase.parse({
      baseUrl: "http://x",
      somethingElse: { foo: 1 },
    });
    expect((parsed as Record<string, unknown>).somethingElse).toEqual({ foo: 1 });
  });

  test("custom error message: invalid baseUrl", () => {
    const r = zAtriumAppConfigBase.safeParse({ baseUrl: "not-a-url" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("baseUrl must be a valid URL");
    }
  });

  test("plugins map: id -> options | false", () => {
    const parsed = zAtriumAppConfigBase.parse({
      plugins: {
        [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
        [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: false,
      },
    });
    expect(parsed.plugins).toEqual({
      [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
      [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: false,
    });
  });

  test("extends accepts string or string[]", () => {
    expect(zAtriumAppConfigBase.parse({ extends: "./a.json" }).extends).toBe("./a.json");
    expect(zAtriumAppConfigBase.parse({ extends: ["./a.json", "./b.json"] }).extends).toEqual([
      "./a.json",
      "./b.json",
    ]);
  });
});

describe("extendAtriumAppConfig", () => {
  test("preserves base fields and adds extension fields", () => {
    const schema = extendAtriumAppConfig({});
    const parsed = schema.parse({ baseUrl: "http://x" });
    expect(parsed.baseUrl).toBe("http://x");
  });
});
