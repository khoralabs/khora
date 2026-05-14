import { createHash } from "node:crypto";
import { ObpError } from "@khoralabs/obp-v2-errors";
import type { FrameLikeForSessionOp } from "@khoralabs/obp-v2-session-impl";

import type { Frame, SessionInitNormalized } from "./frame-protocol-types.ts";
import type { FrameSigner } from "./frame-signer.ts";

export function partyIdForActor(init: SessionInitNormalized, actor: string): string {
  const p = init.parties.find((x) => x.pubkey === actor);
  if (p === undefined) throw new ObpError("VALIDATION", `unknown actor ${actor}`);
  return p.id;
}

export function templateMatch(
  wire: SessionInitNormalized,
  t: Pick<SessionInitNormalized, "parties">,
): boolean {
  return (
    wire.parties[0].id === t.parties[0].id &&
    wire.parties[1].id === t.parties[1].id &&
    wire.parties[0].pubkey === t.parties[0].pubkey &&
    wire.parties[1].pubkey === t.parties[1].pubkey
  );
}

export function ensureSignerInSession(init: SessionInitNormalized, signer: FrameSigner): void {
  if (!init.parties.some((p) => p.pubkey === signer.actor)) {
    throw new ObpError("VALIDATION", `signer.actor ${signer.actor} not in session parties`);
  }
}

export function remoteActorForSigner(init: SessionInitNormalized, signer: FrameSigner): string {
  const remote = init.parties.find((p) => p.pubkey !== signer.actor)?.pubkey;
  if (remote === undefined) {
    throw new ObpError("VALIDATION", "cannot resolve remote actor");
  }
  return remote;
}

export function frameDedupeKeyHex(frame: Frame): string {
  return createHash("sha256").update(`${frame.p_hash}:${frame.sig}`, "utf8").digest("hex");
}

export function frameAsOpLike(frame: Frame): FrameLikeForSessionOp {
  return {
    type: frame.type as FrameLikeForSessionOp["type"],
    actor: frame.actor,
    body: frame.body as Record<string, unknown>,
  };
}
