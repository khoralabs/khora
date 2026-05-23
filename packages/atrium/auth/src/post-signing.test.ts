import { describe, expect, test } from "bun:test";
import { generateAgentIdentity } from "@khoralabs/agent-persisted-signer";
import {
  atriumPostSigningPayloadFromCreate,
  canonicalAtriumPostSigningPayload,
  signAtriumPostPayload,
  verifyAtriumPostSignature,
} from "./post-signing.ts";

describe("post-signing", () => {
  test("sign and verify round-trip", async () => {
    const signer = await generateAgentIdentity();
    const payload = atriumPostSigningPayloadFromCreate(signer.did, {
      body: "hello world",
      title: "Hi",
    });
    const sig = await signAtriumPostPayload(signer, payload);
    await verifyAtriumPostSignature({
      authorDid: signer.did,
      authorSignature: sig,
      payload,
    });
  });

  test("canonical payload is stable", () => {
    const payload = atriumPostSigningPayloadFromCreate("did:key:z6Mkha", {
      body: "b",
      topics: ["a"],
    });
    const a = canonicalAtriumPostSigningPayload(payload);
    const b = canonicalAtriumPostSigningPayload(payload);
    expect(new TextDecoder().decode(a)).toBe(new TextDecoder().decode(b));
  });
});
