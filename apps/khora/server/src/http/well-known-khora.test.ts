import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildKhoraWellKnownDocument, handleWellKnownKhora } from "./well-known-khora.ts";

describe("well-known khora", () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "PORT",
      "KHORA_HOST_SLUG",
      "KHORA_PUBLIC_BASE_URL",
      "KHORA_REGISTRY_URL",
    ] as const) {
      prev[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });

  test("builds document with defaults", () => {
    delete process.env.KHORA_HOST_SLUG;
    delete process.env.KHORA_PUBLIC_BASE_URL;
    delete process.env.KHORA_REGISTRY_URL;
    process.env.PORT = "8788";

    const doc = buildKhoraWellKnownDocument();
    expect(doc).toEqual({
      version: 1,
      baseUrl: "http://127.0.0.1:8788",
      endpoints: {
        health: "/health",
        ready: "/ready",
        register: "/v1/register",
      },
    });
  });

  test("includes slug and registry when set", () => {
    process.env.KHORA_HOST_SLUG = "my-lab";
    process.env.KHORA_PUBLIC_BASE_URL = "https://host.example.com/";
    process.env.KHORA_REGISTRY_URL = "http://localhost:4000/";

    const doc = buildKhoraWellKnownDocument();
    expect(doc.slug).toBe("my-lab");
    expect(doc.baseUrl).toBe("https://host.example.com");
    expect(doc.registryUrl).toBe("http://localhost:4000");
  });

  test("handleWellKnownKhora returns JSON", async () => {
    process.env.PORT = "8788";
    const res = handleWellKnownKhora();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = (await res.json()) as { version: number };
    expect(body.version).toBe(1);
  });
});
