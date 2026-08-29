import { describe, expect, test } from "bun:test";

import { resolveCliVersion } from "./cli-version";

describe("resolveCliVersion", () => {
  test("prefers KHORA_CLI_VERSION env", () => {
    expect(resolveCliVersion({ KHORA_CLI_VERSION: "1.2.3" })).toBe("1.2.3");
  });

  test("reads package.json from KHORA_CLI_ASSETS_DIR", () => {
    const assetsDir = import.meta.dir.replace("/src/lib", "");
    expect(resolveCliVersion({ KHORA_CLI_ASSETS_DIR: assetsDir })).toBe("0.0.0");
  });

  test("falls back to monorepo package.json", () => {
    expect(resolveCliVersion({})).toBe("0.0.0");
  });
});
