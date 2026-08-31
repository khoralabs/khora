import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  clearRegistrySessionCookie,
  defaultRegistryUrl,
  loadRegistrySessionCookie,
  saveRegistrySessionCookie,
} from "./index";

describe("agent-client stores", () => {
  let dir: string;

  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
    delete process.env.KHORA_REGISTRY_SESSION_FILE;
  });

  test("defaultRegistryUrl returns production default", () => {
    expect(defaultRegistryUrl()).toBe("https://r.khoralabs.com");
  });

  test("session cookie round-trip via override path", () => {
    dir = mkdtempSync(path.join(tmpdir(), "khora-reg-sess-"));
    process.env.KHORA_REGISTRY_SESSION_FILE = path.join(dir, "session");
    expect(loadRegistrySessionCookie()).toBeNull();
    saveRegistrySessionCookie("sid=abc");
    expect(loadRegistrySessionCookie()).toBe("sid=abc");
    clearRegistrySessionCookie();
    expect(loadRegistrySessionCookie()).toBeNull();
  });
});
