import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { type AgentSigner, generateAgentIdentity } from "@khoralabs/agent-persisted-signer";
import { createKhoraDidAuth } from "./auth.ts";
import {
  AGENT_REQUEST_HEADER,
  canonicalAgentRequestMessage,
  signatureBytesToB64Url,
} from "./wire.ts";

function freshDb(): Database {
  return new Database(":memory:");
}

async function buildSignedHeaders(p: {
  signer: AgentSigner;
  method: string;
  path: string;
  bodyText: string;
  timestampMs: number;
  nonce: string;
}): Promise<Headers> {
  const message = await canonicalAgentRequestMessage({
    method: p.method,
    path: p.path,
    timestampMs: p.timestampMs,
    nonce: p.nonce,
    bodyText: p.bodyText,
  });
  const sig = await p.signer.sign(message);
  const h = new Headers();
  h.set(AGENT_REQUEST_HEADER.did, p.signer.did);
  h.set(AGENT_REQUEST_HEADER.ts, String(p.timestampMs));
  h.set(AGENT_REQUEST_HEADER.nonce, p.nonce);
  h.set(AGENT_REQUEST_HEADER.sig, signatureBytesToB64Url(sig));
  return h;
}

describe("KhoraDidAuth.preflight (did:key Ed25519 default)", () => {
  test("accepts fresh + valid signed request", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const headers = await buildSignedHeaders({
      signer,
      method: "PATCH",
      path: "/v1/profile",
      bodyText: '{"displayName":"A"}',
      timestampMs: now,
      nonce: "nonce-1",
    });
    await expect(
      auth.preflight.verifyAuthenticatedAgent({
        method: "PATCH",
        path: "/v1/profile",
        headers,
        claimedPrincipalId: signer.did,
        bodyText: '{"displayName":"A"}',
      }),
    ).resolves.toBeUndefined();
  });

  test("rejects stale timestamp", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const headers = await buildSignedHeaders({
      signer,
      method: "GET",
      path: "/v1/agent/sync",
      bodyText: "",
      timestampMs: now - 120_000,
      nonce: "old",
    });
    await expect(
      auth.preflight.verifyAuthenticatedAgent({
        method: "GET",
        path: "/v1/agent/sync",
        headers,
        claimedPrincipalId: signer.did,
      }),
    ).rejects.toThrow(/window/);
  });

  test("rejects duplicate nonce", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const headers = await buildSignedHeaders({
      signer,
      method: "GET",
      path: "/v1/agent/sync",
      bodyText: "",
      timestampMs: now,
      nonce: "same",
    });
    await auth.preflight.verifyAuthenticatedAgent({
      method: "GET",
      path: "/v1/agent/sync",
      headers,
      claimedPrincipalId: signer.did,
    });
    await expect(
      auth.preflight.verifyAuthenticatedAgent({
        method: "GET",
        path: "/v1/agent/sync",
        headers,
        claimedPrincipalId: signer.did,
      }),
    ).rejects.toThrow(/nonce/);
  });

  test("rejects DID mismatch", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const headers = await buildSignedHeaders({
      signer,
      method: "GET",
      path: "/v1/agent/sync",
      bodyText: "",
      timestampMs: now,
      nonce: "n",
    });
    await expect(
      auth.preflight.verifyAuthenticatedAgent({
        method: "GET",
        path: "/v1/agent/sync",
        headers,
        claimedPrincipalId: "did:key:zSomethingElse",
      }),
    ).rejects.toThrow(/mismatch/);
  });

  test("rejects bad signature (tampered body)", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const headers = await buildSignedHeaders({
      signer,
      method: "POST",
      path: "/v1/posts",
      bodyText: '{"body":"a"}',
      timestampMs: now,
      nonce: "n-tampered",
    });
    await expect(
      auth.preflight.verifyAuthenticatedAgent({
        method: "POST",
        path: "/v1/posts",
        headers,
        claimedPrincipalId: signer.did,
        bodyText: '{"body":"b"}',
      }),
    ).rejects.toThrow(/signature/);
  });

  test("verifyRegistration also checks body DID matches signature DID", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const bodyText = JSON.stringify({ did: "did:key:zMismatch" });
    const headers = await buildSignedHeaders({
      signer,
      method: "POST",
      path: "/v1/register",
      bodyText,
      timestampMs: now,
      nonce: "n-reg",
    });
    await expect(
      auth.preflight.verifyRegistration({
        request: { principalId: "did:key:zMismatch" },
        headers,
        bodyText,
      }),
    ).rejects.toThrow();
  });

  test("verifyUnregister signs POST /v1/unregister", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const bodyText = JSON.stringify({ did: signer.did });
    const headers = await buildSignedHeaders({
      signer,
      method: "POST",
      path: "/v1/unregister",
      bodyText,
      timestampMs: now,
      nonce: "n-unreg",
    });
    await auth.verifyUnregister(
      new Request("http://local/unregister", { method: "POST", headers, body: bodyText }),
      bodyText,
      { principalId: signer.did },
    );
  });
});

describe("KhoraDidAuth.requireAuthenticatedRequest", () => {
  test("returns DID on success and wraps failures in AuthError", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const headers = await buildSignedHeaders({
      signer,
      method: "GET",
      path: "/v1/agent/sync",
      bodyText: "",
      timestampMs: now,
      nonce: "n-ok",
    });
    const req = new Request("https://h.example/v1/agent/sync", { method: "GET", headers });
    const url = new URL(req.url);
    const out = await auth.requireAuthenticatedRequest(req, url);
    expect(out.did).toBe(signer.did);

    const noDidReq = new Request("https://h.example/v1/agent/sync");
    await expect(auth.requireAuthenticatedRequest(noDidReq, new URL(noDidReq.url))).rejects.toThrow(
      /header required/,
    );
  });
});

describe("KhoraDidAuth.requireInboxAccess (signed query allowlist)", () => {
  test("accepts /v1/inbox?limit=10&markRead=1 when client signs the canonical path", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const headers = await buildSignedHeaders({
      signer,
      method: "GET",
      path: "/v1/inbox?limit=10&markRead=1",
      bodyText: "",
      timestampMs: now,
      nonce: "n-inbox-ok",
    });
    const req = new Request("https://h.example/v1/inbox?limit=10&markRead=1", {
      method: "GET",
      headers,
    });
    const url = new URL(req.url);
    const out = await auth.requireInboxAccess(req, url, ["limit", "markRead"]);
    expect(out.did).toBe(signer.did);
  });

  test("rejects when the URL query is tampered after signing", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const headers = await buildSignedHeaders({
      signer,
      method: "GET",
      path: "/v1/inbox?limit=10",
      bodyText: "",
      timestampMs: now,
      nonce: "n-inbox-tampered",
    });
    const req = new Request("https://h.example/v1/inbox?limit=500", { method: "GET", headers });
    const url = new URL(req.url);
    await expect(auth.requireInboxAccess(req, url, ["limit", "markRead"])).rejects.toThrow(
      /signature/i,
    );
  });

  test("allowlist order is canonical regardless of URL order", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createKhoraDidAuth({ db, now: () => now });
    const signer = await generateAgentIdentity();
    const headers = await buildSignedHeaders({
      signer,
      method: "GET",
      path: "/v1/inbox?limit=10&markRead=1",
      bodyText: "",
      timestampMs: now,
      nonce: "n-inbox-order",
    });
    const req = new Request("https://h.example/v1/inbox?markRead=1&limit=10", {
      method: "GET",
      headers,
    });
    const url = new URL(req.url);
    const out = await auth.requireInboxAccess(req, url, ["limit", "markRead"]);
    expect(out.did).toBe(signer.did);
  });
});
