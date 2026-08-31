import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  agentAuthComplete,
  agentAuthRegister,
  clearAgentAuthPending,
  clearRegistrySessionCookie,
  loadRegistrySessionCookie,
  readAgentAuthPending,
  registrySessionFilePath,
  saveRegistrySessionCookie,
  writeAgentAuthPending,
} from "@khoralabs/khora-registry/agent-client";
import { cliRegistryUrl } from "../registry/config";

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

describe("agent auth client helpers", () => {
  const prevFetch = globalThis.fetch;
  let calls: { url: string; init?: RequestInit }[] = [];

  beforeEach(() => {
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, init });
      if (url.endsWith("/agent/auth")) {
        return Response.json({
          registration_id: "reg-1",
          claim_token: "clm_test",
          status: "pending_claim",
        });
      }
      if (url.endsWith("/agent/auth/claim/complete")) {
        return Response.json({
          status: "claimed",
          credential: { type: "session", session_cookie: "better-auth.session_token=abc" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = prevFetch;
  });

  test("register posts verified_email identity assertion", async () => {
    const json = await agentAuthRegister("http://registry.test", "user@example.com");
    expect(json.claim_token).toBe("clm_test");
    expect(calls[0]?.init?.body).toContain("verified_email");
  });

  test("complete returns session cookie", async () => {
    const cookie = await agentAuthComplete("http://registry.test", {
      email: "user@example.com",
      otp: "123456",
      claimToken: "clm_test",
    });
    expect(cookie).toContain("better-auth.session_token=");
  });
});

describe("agent auth pending store", () => {
  let dir: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    prevHome = process.env.HOME;
    dir = mkdtempSync(path.join(tmpdir(), "khora-agent-auth-"));
    process.env.HOME = dir;
    clearAgentAuthPending();
  });

  afterEach(() => {
    clearAgentAuthPending();
    rmSync(dir, { recursive: true, force: true });
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
  });

  test("round-trips pending claim state", () => {
    writeAgentAuthPending({
      email: "a@b.com",
      claimToken: "clm_x",
      registrationId: "reg-1",
      createdAtMs: 1,
    });
    const pending = readAgentAuthPending();
    expect(pending?.email).toBe("a@b.com");
    expect(pending?.claimToken).toBe("clm_x");
  });
});
