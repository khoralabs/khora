import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { EdDSASigner } from "iso-signatures/signers/eddsa.js";
import { createAtriumDidAuth } from "./auth.ts";
import {
  AGENT_REQUEST_HEADER,
  canonicalAgentRequestMessage,
  signatureBytesToB64Url,
} from "./wire.ts";

function freshDb(): Database {
  return new Database(":memory:");
}

async function buildSignedHeaders(p: {
  signer: EdDSASigner;
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

describe("AtriumDidAuth.verifier (did:key Ed25519 default)", () => {
  test("accepts fresh + valid signed request", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createAtriumDidAuth({ db, now: () => now });
    const signer = await EdDSASigner.generate();
    const headers = await buildSignedHeaders({
      signer,
      method: "PATCH",
      path: "/v1/profile",
      bodyText: '{"displayName":"A"}',
      timestampMs: now,
      nonce: "nonce-1",
    });
    await expect(
      auth.verifier.verifyAuthenticatedAgent({
        method: "PATCH",
        path: "/v1/profile",
        headers,
        claimedDid: signer.did,
        bodyText: '{"displayName":"A"}',
      }),
    ).resolves.toBeUndefined();
  });

  test("rejects stale timestamp", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createAtriumDidAuth({ db, now: () => now });
    const signer = await EdDSASigner.generate();
    const headers = await buildSignedHeaders({
      signer,
      method: "GET",
      path: "/v1/agent/sync",
      bodyText: "",
      timestampMs: now - 120_000,
      nonce: "old",
    });
    await expect(
      auth.verifier.verifyAuthenticatedAgent({
        method: "GET",
        path: "/v1/agent/sync",
        headers,
        claimedDid: signer.did,
      }),
    ).rejects.toThrow(/window/);
  });

  test("rejects duplicate nonce", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createAtriumDidAuth({ db, now: () => now });
    const signer = await EdDSASigner.generate();
    const headers = await buildSignedHeaders({
      signer,
      method: "GET",
      path: "/v1/agent/sync",
      bodyText: "",
      timestampMs: now,
      nonce: "same",
    });
    await auth.verifier.verifyAuthenticatedAgent({
      method: "GET",
      path: "/v1/agent/sync",
      headers,
      claimedDid: signer.did,
    });
    await expect(
      auth.verifier.verifyAuthenticatedAgent({
        method: "GET",
        path: "/v1/agent/sync",
        headers,
        claimedDid: signer.did,
      }),
    ).rejects.toThrow(/nonce/);
  });

  test("rejects DID mismatch", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createAtriumDidAuth({ db, now: () => now });
    const signer = await EdDSASigner.generate();
    const headers = await buildSignedHeaders({
      signer,
      method: "GET",
      path: "/v1/agent/sync",
      bodyText: "",
      timestampMs: now,
      nonce: "n",
    });
    await expect(
      auth.verifier.verifyAuthenticatedAgent({
        method: "GET",
        path: "/v1/agent/sync",
        headers,
        claimedDid: "did:key:zSomethingElse",
      }),
    ).rejects.toThrow(/mismatch/);
  });

  test("rejects bad signature (tampered body)", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createAtriumDidAuth({ db, now: () => now });
    const signer = await EdDSASigner.generate();
    const headers = await buildSignedHeaders({
      signer,
      method: "POST",
      path: "/v1/posts",
      bodyText: '{"body":"a"}',
      timestampMs: now,
      nonce: "n-tampered",
    });
    await expect(
      auth.verifier.verifyAuthenticatedAgent({
        method: "POST",
        path: "/v1/posts",
        headers,
        claimedDid: signer.did,
        bodyText: '{"body":"b"}',
      }),
    ).rejects.toThrow(/signature/);
  });

  test("verifyRegistration also checks body DID matches signature DID", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createAtriumDidAuth({ db, now: () => now });
    const signer = await EdDSASigner.generate();
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
      auth.verifier.verifyRegistration({
        request: { did: "did:key:zMismatch" },
        headers,
        bodyText,
      }),
    ).rejects.toThrow();
  });
});

describe("AtriumDidAuth.requireAuthenticatedRequest", () => {
  test("returns DID on success and wraps failures in AuthError", async () => {
    const db = freshDb();
    const now = 1_700_000_000_000;
    const auth = createAtriumDidAuth({ db, now: () => now });
    const signer = await EdDSASigner.generate();
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
    await expect(
      auth.requireAuthenticatedRequest(noDidReq, new URL(noDidReq.url)),
    ).rejects.toThrow(/header required/);
  });
});
