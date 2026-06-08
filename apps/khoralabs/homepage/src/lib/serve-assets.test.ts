import { describe, expect, test } from "bun:test";
import path from "node:path";
import { ASSETS_DIR, resolveAssetPath } from "./serve-assets";

describe("resolveAssetPath", () => {
  test("resolves nested file under assets dir", () => {
    const resolved = resolveAssetPath("/assets/khora_logo_text_w.svg");
    expect(resolved).toBe(path.join(ASSETS_DIR, "khora_logo_text_w.svg"));
  });

  test("rejects path traversal", () => {
    expect(resolveAssetPath("/assets/../secret.png")).toBeNull();
  });

  test("rejects unsupported extension", () => {
    expect(resolveAssetPath("/assets/config.json")).toBeNull();
  });
});
