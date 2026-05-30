import { describe, expect, test } from "bun:test";
import { generateAgentIdentity } from "@khoralabs/agent-persisted-signer";
import {
  canonicalKhoraPostSigningPayload,
  khoraPostSigningPayloadFromCreate,
  signKhoraPostPayload,
  verifyKhoraPostSignature,
} from "./post-signing";

describe("post-signing", () => {
  test("sign and verify round-trip", async () => {
    const signer = await generateAgentIdentity();
    const payload = khoraPostSigningPayloadFromCreate(signer.did, {
      body: "hello world",
      title: "Hi",
    });
    const sig = await signKhoraPostPayload(signer, payload);
    await verifyKhoraPostSignature({
      authorDid: signer.did,
      authorSignature: sig,
      payload,
    });
  });

  test("canonical payload is stable", () => {
    const payload = khoraPostSigningPayloadFromCreate("did:key:z6Mkha", {
      body: "b",
      topics: ["a"],
    });
    const a = canonicalKhoraPostSigningPayload(payload);
    const b = canonicalKhoraPostSigningPayload(payload);
    expect(new TextDecoder().decode(a)).toBe(new TextDecoder().decode(b));
  });
});
