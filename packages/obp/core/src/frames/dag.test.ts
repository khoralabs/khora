import { expect, test } from "bun:test";
import { ObpError } from "../obp-error.ts";
import { canonicalJsonString } from "./canonical.ts";
import { FrameDag, sha256HexUtf8, signingPayloadBytes } from "./dag.ts";
import {
  createEd25519FrameSigner,
  createEd25519FrameVerifier,
  generateEd25519KeyPair,
} from "./signer.ts";
import type { Frame } from "./types.ts";

test("FrameDag chain: mint and append agree on tip", async () => {
  const pair = await generateEd25519KeyPair();
  const signer = await createEd25519FrameSigner(pair.privateKey, pair.publicKey);
  const verifier = createEd25519FrameVerifier();
  const genesis = await sha256HexUtf8("__genesis_test__");
  const a = new FrameDag(genesis);
  const f0 = await a.mintOutbound(signer, "TURN", {
    offerId: "o1",
    offerType: "obp.frame",
    ports: [{ id: "p1", isTerminal: false, bind_policy: null, ttl: null }],
  });
  expect(f0.p_hash).toBe(genesis);

  const b = new FrameDag(genesis);
  await b.appendInbound(f0, verifier);
  expect(b.tipHash).toBe(a.tipHash);
});

test("signOutboundAtTip does not advance tip until commitTip", async () => {
  const pair = await generateEd25519KeyPair();
  const signer = await createEd25519FrameSigner(pair.privateKey, pair.publicKey);
  const genesis = await sha256HexUtf8("g-sign-only");
  const dag = new FrameDag(genesis);
  const { frame, nextTip } = await dag.signOutboundAtTip(signer, "TURN", {
    offerId: "o",
    offerType: "obp.frame",
    ports: [],
  });
  expect(dag.tipHash).toBe(genesis);
  expect(nextTip).toBe(await sha256HexUtf8(canonicalJsonString(frame)));
  dag.commitTip(nextTip);
  expect(dag.tipHash).toBe(nextTip);
});

test("verifyInboundChild does not advance tip; commitTip does", async () => {
  const pair = await generateEd25519KeyPair();
  const signer = await createEd25519FrameSigner(pair.privateKey, pair.publicKey);
  const verifier = createEd25519FrameVerifier();
  const genesis = await sha256HexUtf8("g-verify");
  const sender = new FrameDag(genesis);
  const { frame } = await sender.signOutboundAtTip(signer, "TURN", {
    offerId: "o",
    offerType: "obp.frame",
    ports: [],
  });
  sender.commitTip(await sha256HexUtf8(canonicalJsonString(frame)));

  const recv = new FrameDag(genesis);
  await recv.verifyInboundChild(frame, verifier);
  expect(recv.tipHash).toBe(genesis);
  recv.commitTip(await sha256HexUtf8(canonicalJsonString(frame)));
  expect(recv.tipHash).toBe(sender.tipHash);
});

test("appendInbound rejects causal mismatch", async () => {
  const pair = await generateEd25519KeyPair();
  const signer = await createEd25519FrameSigner(pair.privateKey, pair.publicKey);
  const verifier = createEd25519FrameVerifier();
  const genesis = await sha256HexUtf8("g");
  const dag = new FrameDag(genesis);
  const bad: Frame = {
    p_hash: "0".repeat(64),
    actor: signer.actor,
    sig: "",
    type: "TERMINATE",
    body: { reason: "x", code: "y" },
  };
  const sig = await signer.sign(signingPayloadBytes(bad));
  const f: Frame = { ...bad, sig };
  try {
    await dag.appendInbound(f, verifier);
    expect(true).toBe(false);
  } catch (e) {
    expect(e).toBeInstanceOf(ObpError);
    expect((e as ObpError).code).toBe("CAUSAL_MISMATCH");
  }
});
