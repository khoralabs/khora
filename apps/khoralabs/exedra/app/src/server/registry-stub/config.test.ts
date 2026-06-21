import { afterEach, describe, expect, test } from "bun:test";

import { getStubRegistryPublicUrl } from "./config.js";

describe("getStubRegistryPublicUrl", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env.EXEDRA_PUBLIC_URL = prev.EXEDRA_PUBLIC_URL;
    process.env.REGISTRY_URL = prev.REGISTRY_URL;
    process.env.BUN_PUBLIC_KHORA_REGISTRY_URL = prev.BUN_PUBLIC_KHORA_REGISTRY_URL;
    process.env.PORT = prev.PORT;
  });

  test("ignores external REGISTRY_URL and uses Exedra port", () => {
    process.env.REGISTRY_URL = "http://localhost:4000";
    process.env.BUN_PUBLIC_KHORA_REGISTRY_URL = "http://localhost:4000";
    process.env.PORT = "3000";
    delete process.env.EXEDRA_PUBLIC_URL;

    expect(getStubRegistryPublicUrl()).toBe("http://localhost:3000");
  });

  test("prefers EXEDRA_PUBLIC_URL when set", () => {
    process.env.EXEDRA_PUBLIC_URL = "http://127.0.0.1:3000";
    process.env.REGISTRY_URL = "http://localhost:4000";

    expect(getStubRegistryPublicUrl()).toBe("http://127.0.0.1:3000");
  });
});
