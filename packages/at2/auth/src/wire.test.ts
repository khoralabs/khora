import { describe, expect, test } from "bun:test";
import {
  AGENT_REQUEST_HEADER,
  canonicalAgentRequestMessage,
  canonicalAgentRequestPath,
  envelopeSignatureBytes,
  parseAgentRequestEnvelopeFromHeaders,
  parseAgentRequestEnvelopeFromSearch,
  randomAgentRequestNonce,
  signatureBytesToB64Url,
} from "./wire.ts";

describe("canonicalAgentRequestMessage", () => {
  test("deterministic body shape METHOD\\nPATH\\nts\\nnonce\\nbodyHash", async () => {
    const bytes = await canonicalAgentRequestMessage({
      method: "post",
      path: "/v1/posts",
      timestampMs: 1700000000000,
      nonce: "nonce-abc",
      bodyText: "{}",
    });
    const text = new TextDecoder().decode(bytes);
    const lines = text.split("\n");
    expect(lines[0]).toBe("POST");
    expect(lines[1]).toBe("/v1/posts");
    expect(lines[2]).toBe("1700000000000");
    expect(lines[3]).toBe("nonce-abc");
    expect(lines[4]?.length).toBeGreaterThan(0);
    expect(lines[4]).not.toContain("=");
  });

  test("body hash differs for different body bytes", async () => {
    const a = await canonicalAgentRequestMessage({
      method: "POST",
      path: "/x",
      timestampMs: 1,
      nonce: "n",
      bodyText: "a",
    });
    const b = await canonicalAgentRequestMessage({
      method: "POST",
      path: "/x",
      timestampMs: 1,
      nonce: "n",
      bodyText: "b",
    });
    expect(new TextDecoder().decode(a)).not.toBe(new TextDecoder().decode(b));
  });
});

describe("canonicalAgentRequestPath", () => {
  test("returns pathname unchanged when allowlist is empty", () => {
    const sp = new URLSearchParams("limit=10&markRead=1");
    expect(canonicalAgentRequestPath("/v1/inbox", sp, [])).toBe("/v1/inbox");
  });

  test("returns pathname unchanged when no allowed keys are present", () => {
    const sp = new URLSearchParams("foo=bar");
    expect(canonicalAgentRequestPath("/v1/inbox", sp, ["limit", "markRead"])).toBe("/v1/inbox");
  });

  test("appends allowlisted keys in allowlist order, not URL order", () => {
    const sp = new URLSearchParams("markRead=1&limit=10");
    expect(canonicalAgentRequestPath("/v1/inbox", sp, ["limit", "markRead"])).toBe(
      "/v1/inbox?limit=10&markRead=1",
    );
  });

  test("skips missing keys and preserves the rest", () => {
    const sp = new URLSearchParams("limit=10");
    expect(canonicalAgentRequestPath("/v1/inbox", sp, ["limit", "markRead"])).toBe(
      "/v1/inbox?limit=10",
    );
  });

  test("silently ignores stray keys outside the allowlist", () => {
    const sp = new URLSearchParams("limit=10&hostile=1&markRead=1");
    expect(canonicalAgentRequestPath("/v1/inbox", sp, ["limit", "markRead"])).toBe(
      "/v1/inbox?limit=10&markRead=1",
    );
  });

  test("preserves multi-value keys in URL order under a single allowlist entry", () => {
    const sp = new URLSearchParams("topic=a&topic=b");
    expect(canonicalAgentRequestPath("/v1/feed", sp, ["topic"])).toBe("/v1/feed?topic=a&topic=b");
  });
});

describe("agent-request envelope parsing", () => {
  test("headers round-trip", () => {
    const sig = signatureBytesToB64Url(new Uint8Array([1, 2, 3, 4]));
    const headers = new Headers();
    headers.set(AGENT_REQUEST_HEADER.did, "did:key:abc");
    headers.set(AGENT_REQUEST_HEADER.ts, "1700000000000");
    headers.set(AGENT_REQUEST_HEADER.nonce, "nonce-xyz");
    headers.set(AGENT_REQUEST_HEADER.sig, sig);
    const env = parseAgentRequestEnvelopeFromHeaders(headers);
    expect(env).toBeDefined();
    expect(env?.did).toBe("did:key:abc");
    expect(env?.timestampMs).toBe(1700000000000);
    expect(env?.nonce).toBe("nonce-xyz");
    expect(env && Array.from(envelopeSignatureBytes(env))).toEqual([1, 2, 3, 4]);
  });

  test("missing fields return undefined", () => {
    const headers = new Headers();
    headers.set(AGENT_REQUEST_HEADER.did, "did:key:abc");
    expect(parseAgentRequestEnvelopeFromHeaders(headers)).toBeUndefined();
  });

  test("search params round-trip", () => {
    const sp = new URLSearchParams({
      did: "did:key:abc",
      ts: "1700000000000",
      nonce: "n",
      sig: "AAA",
    });
    const env = parseAgentRequestEnvelopeFromSearch(sp);
    expect(env?.did).toBe("did:key:abc");
    expect(env?.timestampMs).toBe(1700000000000);
  });
});

describe("randomAgentRequestNonce", () => {
  test("produces unique base64url tokens", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 32; i++) {
      const n = randomAgentRequestNonce();
      expect(/^[A-Za-z0-9_-]+$/.test(n)).toBe(true);
      seen.add(n);
    }
    expect(seen.size).toBe(32);
  });
});
