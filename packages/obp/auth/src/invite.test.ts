import { expect, test } from "bun:test";
import {
  createEd25519FrameSigner,
  generateEd25519KeyPair,
  normalizeSessionInit,
  sha256HexUtf8,
} from "@cfd/obp-core";
import { signInvite, verifyInvite } from "./invite.ts";

test("invite roundtrip and expiry", async () => {
  const k1 = await generateEd25519KeyPair();
  const k2 = await generateEd25519KeyPair();
  const signer = await createEd25519FrameSigner(k1.privateKey, k1.publicKey);
  const peer = await createEd25519FrameSigner(k2.privateKey, k2.publicKey);
  const genesis = await sha256HexUtf8("invite-test");
  const init = normalizeSessionInit({
    session_id: "inv-test",
    parties: [
      { id: "11111111-1111-1111-1111-111111111111", pubkey: signer.actor },
      { id: "22222222-2222-2222-2222-222222222222", pubkey: peer.actor },
    ],
    genesis_hash: genesis,
  });

  const token = await signInvite(init, signer, { nonce: "abc", issuedAt: 1 });
  const got = await verifyInvite(token, signer.actor, { nowMs: 2 });
  expect(got).toEqual(init);

  const badActor = await verifyInvite(token, "f".repeat(64));
  expect(badActor).toBeNull();

  const expired = await signInvite(init, signer, {
    nonce: "x",
    issuedAt: 0,
    expiresAt: 10,
  });
  expect(await verifyInvite(expired, signer.actor, { nowMs: 11 })).toBeNull();
  expect(await verifyInvite(expired, signer.actor, { nowMs: 10 })).not.toBeNull();
});
