import { describe, expect, test } from "bun:test";
import { resolveCliHost } from "./context.ts";

describe("resolveCliHost", () => {
  test("prefers --base-url flag", () => {
    const r = resolveCliHost({ "base-url": "http://example.com:8787" });
    expect(r.baseUrl).toBe("http://example.com:8787");
  });

  test("--host flag sets slug", () => {
    const r = resolveCliHost({ host: "my-host", "base-url": "http://a.com" });
    expect(r.slug).toBe("my-host");
  });
});
