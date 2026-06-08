import { describe, expect, test } from "bun:test";
import { buildSiteDiscovery, zKhoralabsSiteDiscovery } from "./site-discovery";

describe("buildSiteDiscovery", () => {
  test("validates against schema and includes skill install script", () => {
    process.env.BUN_PUBLIC_KHORA_REGISTRY_URL = "https://r.khoralabs.com";
    const discovery = buildSiteDiscovery("https://khoralabs.com");
    expect(zKhoralabsSiteDiscovery.safeParse(discovery).success).toBe(true);
    expect(discovery.skill.url).toContain("/downloads/skills/khora-cli/SKILL.md");
    expect(discovery.skill.installScript).toContain("curl -fsSL");
    expect(discovery.auth.authMd).toBe("https://khoralabs.com/auth.md");
    expect(discovery.auth.protectedResourceMetadata).toBe(
      "https://r.khoralabs.com/.well-known/oauth-protected-resource",
    );
    delete process.env.BUN_PUBLIC_KHORA_REGISTRY_URL;
  });
});
