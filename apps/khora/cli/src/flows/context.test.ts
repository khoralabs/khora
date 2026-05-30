import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCliHost } from "./context";

describe("resolveCliHost", () => {
  test("prefers --base-url flag", () => {
    const r = resolveCliHost({ "base-url": "http://example.com:8787" });
    expect(r.baseUrl).toBe("http://example.com:8787");
  });

  test("--host flag sets slug", () => {
    const r = resolveCliHost({ host: "my-host", "base-url": "http://a.com" });
    expect(r.slug).toBe("my-host");
  });

  test("uses currentHost and hosts from config file", () => {
    const dir = mkdtempSync(join(tmpdir(), "khora-cli-test-"));
    const configPath = join(dir, "cli.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        currentHost: "my-lab",
        hosts: { "my-lab": { baseUrl: "http://lab:8788" } },
      }),
    );
    try {
      const r = resolveCliHost({ config: configPath });
      expect(r.slug).toBe("my-lab");
      expect(r.baseUrl).toBe("http://lab:8788");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
