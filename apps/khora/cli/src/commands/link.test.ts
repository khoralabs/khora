import { afterEach, describe, expect, test } from "bun:test";

import { cliRegistryUrl } from "../registry/config.ts";
import {
  clearRegistrySessionCookie,
  loadRegistrySessionCookie,
  saveRegistrySessionCookie,
} from "../registry/session-store.ts";

describe("cliRegistryUrl", () => {
  const prev = process.env.KHORA_REGISTRY_URL;
  afterEach(() => {
    if (prev === undefined) delete process.env.KHORA_REGISTRY_URL;
    else process.env.KHORA_REGISTRY_URL = prev;
  });

  test("defaults to localhost:4000", () => {
    delete process.env.KHORA_REGISTRY_URL;
    expect(cliRegistryUrl({})).toBe("http://localhost:4000");
  });

  test("reads flag", () => {
    expect(cliRegistryUrl({ "registry-url": "https://registry.example.com/" })).toBe(
      "https://registry.example.com",
    );
  });
});

describe("registry session store", () => {
  afterEach(() => {
    clearRegistrySessionCookie();
  });

  test("save and load round-trip via keychain", () => {
    const cookie = "better-auth.session_token=test-roundtrip";
    saveRegistrySessionCookie(cookie);
    expect(loadRegistrySessionCookie()).toBe(cookie);
  });
});
