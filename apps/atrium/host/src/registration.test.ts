import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_REQUEST_HEADER,
  canonicalAgentRequestMessage,
  createAtriumDidAuth,
  signatureBytesToB64Url,
} from "@khoralabs/atrium-auth";
import { mergeAtriumProfilePatch, zAtriumProfile } from "@khoralabs/atrium-contracts";
import { SWARM_AGGREGATE_DOMAIN, SWARM_EVENT_KIND } from "@khoralabs/swarm-host";
import { EdDSASigner } from "iso-signatures/signers/eddsa.js";
import { createAtriumHostContext } from "./create-atrium-host.ts";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atrium-register-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeCtx() {
  const dbPath = join(tmp, "atrium.sqlite");
  return createAtriumHostContext({
    dbPath,
    profileNamespace: "atrium/profiles",
    postNamespace: "atrium/posts",
    probeNamespace: "atrium/probes",
    auth: (db) => createAtriumDidAuth({ db }),
  });
}

async function signedRegister(opts: { signer: EdDSASigner; bodyText: string }): Promise<Headers> {
  const ts = Date.now();
  const nonce = `n-${Math.random().toString(36).slice(2)}`;
  const msg = await canonicalAgentRequestMessage({
    method: "POST",
    path: "/v1/register",
    timestampMs: ts,
    nonce,
    bodyText: opts.bodyText,
  });
  const sig = await opts.signer.sign(msg);
  const h = new Headers();
  h.set(AGENT_REQUEST_HEADER.did, opts.signer.did);
  h.set(AGENT_REQUEST_HEADER.ts, String(ts));
  h.set(AGENT_REQUEST_HEADER.nonce, nonce);
  h.set(AGENT_REQUEST_HEADER.sig, signatureBytesToB64Url(sig));
  return h;
}

async function registerOne(
  ctx: ReturnType<typeof makeCtx>,
  signer: EdDSASigner,
  metadata: Record<string, unknown>,
): Promise<unknown> {
  const body = { did: signer.did, metadata };
  const bodyText = JSON.stringify(body);
  const headers = await signedRegister({ signer, bodyText });
  return ctx.host.registerWithDid(
    { did: signer.did, metadata },
    { headers, bodyText, client: { ip: "127.0.0.1" } },
  );
}

describe("atrium registration: username reservation", () => {
  test("first registration reserves the username", async () => {
    const ctx = makeCtx();
    const signer = await EdDSASigner.generate();
    const result = await registerOne(ctx, signer, { username: "Alice-99", displayName: "Alice" });
    expect(zAtriumProfile.parse((result as { profile: unknown }).profile).username).toBe(
      "alice-99",
    );
    expect(ctx.usernamesRepo.lookupByUsername("alice-99")?.did).toBe(signer.did);
    expect(ctx.usernamesRepo.lookupByDid(signer.did)?.username).toBe("alice-99");
  });

  test("second DID with the same username rejects with USERNAME_TAKEN", async () => {
    const ctx = makeCtx();
    const a = await EdDSASigner.generate();
    const b = await EdDSASigner.generate();
    await registerOne(ctx, a, { username: "alice" });
    await expect(registerOne(ctx, b, { username: "alice" })).rejects.toMatchObject({
      message: expect.stringContaining("USERNAME_TAKEN"),
    });
    expect(ctx.usernamesRepo.lookupByUsername("alice")?.did).toBe(a.did);
    expect(ctx.usernamesRepo.lookupByDid(b.did)).toBeUndefined();
  });

  test("registration without a username rejects (required field)", async () => {
    const ctx = makeCtx();
    const signer = await EdDSASigner.generate();
    await expect(registerOne(ctx, signer, {})).rejects.toThrow();
    expect(ctx.usernamesRepo.lookupByDid(signer.did)).toBeUndefined();
  });

  test("re-registration with same DID + same username is idempotent", async () => {
    const ctx = makeCtx();
    const signer = await EdDSASigner.generate();
    await registerOne(ctx, signer, { username: "ada" });
    await registerOne(ctx, signer, { username: "ada" });
    expect(ctx.usernamesRepo.lookupByDid(signer.did)?.username).toBe("ada");
  });

  test("re-registration with different username renames atomically", async () => {
    const ctx = makeCtx();
    const signer = await EdDSASigner.generate();
    await registerOne(ctx, signer, { username: "ada" });
    await registerOne(ctx, signer, { username: "ada-99" });
    expect(ctx.usernamesRepo.lookupByDid(signer.did)?.username).toBe("ada-99");
    expect(ctx.usernamesRepo.lookupByUsername("ada")).toBeUndefined();
    expect(ctx.usernamesRepo.lookupByUsername("ada-99")?.did).toBe(signer.did);
  });

  test("re-registration to a taken username rejects and keeps the original", async () => {
    const ctx = makeCtx();
    const a = await EdDSASigner.generate();
    const b = await EdDSASigner.generate();
    await registerOne(ctx, a, { username: "ada" });
    await registerOne(ctx, b, { username: "bob" });
    await expect(registerOne(ctx, b, { username: "ada" })).rejects.toMatchObject({
      message: expect.stringContaining("USERNAME_TAKEN"),
    });
    expect(ctx.usernamesRepo.lookupByDid(a.did)?.username).toBe("ada");
    expect(ctx.usernamesRepo.lookupByDid(b.did)?.username).toBe("bob");
  });
});

describe("PATCH /v1/profile rename via PROFILE_UPDATED event path", () => {
  test("rename swaps the reservation; old name is freed and reclaimable", async () => {
    const ctx = makeCtx();
    const a = await EdDSASigner.generate();
    const b = await EdDSASigner.generate();
    const aResult = await registerOne(ctx, a, { username: "ada" });
    await registerOne(ctx, b, { username: "bob" });

    // Simulate the PATCH /v1/profile rename path: rename in repo, then notify PROFILE_UPDATED.
    const renameResult = ctx.usernamesRepo.rename(a.did, "alice-99");
    expect(renameResult).toEqual({ ok: true });

    const previousProfile = zAtriumProfile.parse((aResult as { profile: unknown }).profile);
    const next = mergeAtriumProfilePatch(previousProfile, { username: "alice-99" });
    await ctx.host.notify({
      kind: SWARM_EVENT_KIND.PROFILE_UPDATED,
      occurredAt: Date.now(),
      aggregate: { domain: SWARM_AGGREGATE_DOMAIN.profile, id: next.id },
      change: "updated",
      source: "app",
      payload: { profile: next, previous: previousProfile },
    });

    expect(ctx.usernamesRepo.lookupByUsername("ada")).toBeUndefined();
    expect(ctx.usernamesRepo.lookupByUsername("alice-99")?.did).toBe(a.did);

    // The released "ada" can be reclaimed by another DID.
    const c = await EdDSASigner.generate();
    await registerOne(ctx, c, { username: "ada" });
    expect(ctx.usernamesRepo.lookupByUsername("ada")?.did).toBe(c.did);
  });

  test("rename to a taken username returns reason 'taken' and preserves the original", async () => {
    const ctx = makeCtx();
    const a = await EdDSASigner.generate();
    const b = await EdDSASigner.generate();
    await registerOne(ctx, a, { username: "ada" });
    await registerOne(ctx, b, { username: "bob" });

    expect(ctx.usernamesRepo.rename(a.did, "bob")).toEqual({ ok: false, reason: "taken" });
    expect(ctx.usernamesRepo.lookupByDid(a.did)?.username).toBe("ada");
    expect(ctx.usernamesRepo.lookupByDid(b.did)?.username).toBe("bob");
  });
});
