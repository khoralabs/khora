import { afterEach, describe, expect, test } from "bun:test";
import { generateAgentIdentity } from "@khoralabs/khora-auth";

import { encryptIdentityPayload, loadSignerFromEncryptedBlob } from "./crypto";
import {
  registerUserDidOnNetwork,
  usernameForOrg,
  usernameFromEmail,
} from "./network-registration";

const IDENTITY_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const IDENTITY_KEY = Buffer.from(IDENTITY_KEY_HEX, "hex");

afterEach(() => {
  delete process.env.KHORA_HOST_URL;
  delete process.env.KHORA_HOST_SLUG;
});

describe("usernameFromEmail", () => {
  test("derives username from email local part", () => {
    expect(usernameFromEmail("author@example.com", "fallback")).toBe("author");
  });

  test("falls back when email local part is invalid", () => {
    expect(usernameFromEmail("a--b@example.com", "registry-user-1")).toBe("registry-user-1");
  });
});

describe("usernameForOrg", () => {
  test("derives org agent username from org name", () => {
    expect(usernameForOrg("11111111-2222-3333-4444-555555555555", "Acme Corp")).toBe(
      "acme-corp-agent",
    );
  });
});

describe("loadSignerFromEncryptedBlob", () => {
  test("round-trips encrypted identity", async () => {
    const identity = await generateAgentIdentity();
    const blob = encryptIdentityPayload(
      JSON.stringify({ did: identity.did, encoded: identity.export() }),
      IDENTITY_KEY,
    );
    const signer = await loadSignerFromEncryptedBlob(blob, IDENTITY_KEY);
    expect(signer.did).toBe(identity.did);
  });
});

describe("registerUserDidOnNetwork", () => {
  test("registers on host and links to registry when configured", async () => {
    process.env.EXEDRA_IDENTITY_KEY = IDENTITY_KEY_HEX;
    process.env.KHORA_HOST_URL = "https://host.example";
    process.env.KHORA_HOST_SLUG = "demo-host";

    const identity = await generateAgentIdentity();
    const identityEncrypted = encryptIdentityPayload(
      JSON.stringify({ did: identity.did, encoded: identity.export() }),
      IDENTITY_KEY,
    );

    const calls: { url: string; method: string; cookie?: string }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const cookie = new Headers(init?.headers).get("cookie") ?? undefined;
      calls.push({ url, method, cookie });

      if (url.endsWith("/v1/register")) {
        return new Response(
          JSON.stringify({
            did: identity.did,
            profileId: "profile-1",
            profile: { id: "profile-1", username: "author" },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/v1/link/challenge")) {
        return new Response(JSON.stringify({ challengeId: "challenge-1" }), { status: 200 });
      }
      if (url.endsWith("/v1/link/agent")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    try {
      await registerUserDidOnNetwork({
        identityEncrypted,
        email: "author@example.com",
        registrySessionCookie: "better-auth.session_token=signed",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls.some((call) => call.url.endsWith("/v1/register"))).toBe(true);
    expect(calls.some((call) => call.url.includes("/v1/link/challenge"))).toBe(true);
    expect(
      calls.some(
        (call) => call.url.endsWith("/v1/link/agent") && call.cookie?.includes("session_token"),
      ),
    ).toBe(true);
  });

  test("skips when host URL is unset", async () => {
    process.env.EXEDRA_IDENTITY_KEY = IDENTITY_KEY_HEX;
    const identity = await generateAgentIdentity();
    const identityEncrypted = encryptIdentityPayload(
      JSON.stringify({ did: identity.did, encoded: identity.export() }),
      IDENTITY_KEY,
    );

    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response("unexpected", { status: 500 });
    };

    try {
      await registerUserDidOnNetwork({
        identityEncrypted,
        email: "author@example.com",
        registrySessionCookie: "better-auth.session_token=signed",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(called).toBe(false);
  });
});
