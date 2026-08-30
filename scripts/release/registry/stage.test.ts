import { describe, expect, test } from "bun:test";
import { registryPackageReadme } from "./stage";

describe("registryPackageReadme", () => {
  test("includes version and quick start", () => {
    const body = registryPackageReadme("1.2.3");
    expect(body).toContain("# khora-registry 1.2.3");
    expect(body).toContain("REGISTRY_SQLCIPHER_KEY");
    expect(body).toContain("REGISTRY_LITESTREAM");
    expect(body).toContain("bin/khora-registry");
  });
});
