import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { cliRegistryUrl } from "../registry/config";
import {
  clearRegistrySessionCookie,
  loadRegistrySessionCookie,
  registrySessionFilePath,
  saveRegistrySessionCookie,
} from "../registry/session-store";

describe("cliRegistryUrl", () => {
  const prev = process.env.KHORA_REGISTRY_URL;
  let prevHome: string | undefined;
  let isolatedHome: string;

  beforeEach(() => {
    prevHome = process.env.HOME;
    isolatedHome = mkdtempSync(path.join(tmpdir(), "khora-registry-url-"));
    process.env.HOME = isolatedHome;
  });

  afterEach(() => {
    rmSync(isolatedHome, { recursive: true, force: true });
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prev === undefined) delete process.env.KHORA_REGISTRY_URL;
    else process.env.KHORA_REGISTRY_URL = prev;
  });

  test("defaults to production registry when unset", () => {
    delete process.env.KHORA_REGISTRY_URL;
    expect(cliRegistryUrl({})).toBe("https://r.khoralabs.com");
  });

  test("reads flag", () => {
    expect(cliRegistryUrl({ "registry-url": "https://registry.example.com/" })).toBe(
      "https://registry.example.com",
    );
  });
});

describe("registry session store", () => {
  const prevFile = process.env.KHORA_REGISTRY_SESSION_FILE;
  let sessionFile: string;

  afterEach(() => {
    clearRegistrySessionCookie();
    if (sessionFile) rmSync(sessionFile, { force: true });
    if (prevFile === undefined) delete process.env.KHORA_REGISTRY_SESSION_FILE;
    else process.env.KHORA_REGISTRY_SESSION_FILE = prevFile;
  });

  test("save and load round-trip via session file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "khora-session-"));
    sessionFile = path.join(dir, "registry-session");
    process.env.KHORA_REGISTRY_SESSION_FILE = sessionFile;
    const cookie = "better-auth.session_token=test-roundtrip";
    saveRegistrySessionCookie(cookie);
    expect(loadRegistrySessionCookie()).toBe(cookie);
    expect(registrySessionFilePath()).toBe(sessionFile);
  });
});
