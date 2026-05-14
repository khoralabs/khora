/**
 * Wire helpers for **`cfd.obp.frame#SessionInit`** — decode, encode, and normalize
 * the `{ "init": … }` bootstrap envelope on the frame byte stream.
 *
 * These belong in **`@khoralabs/obp-v2-frames-impl`** because `SessionInit` is defined in
 * `frame-protocol.smithy` (`namespace cfd.obp.frame`), not in `cfd.obp.session`.
 */

import { ObpError } from "@khoralabs/obp-v2-errors";
import type { SessionInit, SessionInitNormalized, SessionParty } from "./frame-protocol-types.ts";

function cmpPubkeyHex(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Sort two session participants by ascending signing pubkey (hex). Preserves id↔pubkey pairing. */
export function canonicalSessionParties(
  pair: [SessionParty, SessionParty],
): [SessionParty, SessionParty] {
  const [x, y] = pair;
  if (x.pubkey === y.pubkey) {
    throw new ObpError("VALIDATION", "session parties must have distinct pubkeys");
  }
  return cmpPubkeyHex(x.pubkey, y.pubkey) <= 0 ? [x, y] : [y, x];
}

/** Return a copy with `parties` in canonical pubkey order. */
export function normalizeSessionInit(init: SessionInitNormalized): SessionInitNormalized {
  return {
    session_id: init.session_id,
    genesis_hash: init.genesis_hash,
    parties: canonicalSessionParties(init.parties),
  };
}

/** Graph party id for the frame signer; normalizes `init` internally. */
export function partyIdForSigner(init: SessionInitNormalized, signerActor: string): string {
  const n = normalizeSessionInit(init);
  const p = n.parties.find((x) => x.pubkey === signerActor);
  if (p === undefined) {
    throw new ObpError("VALIDATION", `signer.actor ${signerActor} not in session parties`);
  }
  return p.id;
}

/** Encode `SessionInitNormalized` to the Smithy wire shape `SessionInit`. */
export function sessionInitToWire(init: SessionInitNormalized): SessionInit {
  const n = normalizeSessionInit(init);
  return {
    session_id: n.session_id,
    party_ids: [n.parties[0].id, n.parties[1].id],
    actor_pubkeys: [n.parties[0].pubkey, n.parties[1].pubkey],
    genesis_hash: n.genesis_hash,
  };
}

/** Decode the Smithy wire shape `SessionInit` to `SessionInitNormalized`. */
export function sessionInitFromWire(wire: SessionInit): SessionInitNormalized {
  const a = wire.party_ids[0];
  const b = wire.party_ids[1];
  const ka = wire.actor_pubkeys[0];
  const kb = wire.actor_pubkeys[1];
  if (a === undefined || b === undefined || ka === undefined || kb === undefined) {
    throw new ObpError("VALIDATION", "init requires party_ids[2] and actor_pubkeys[2]");
  }
  const raw: SessionInitNormalized = {
    session_id: wire.session_id,
    genesis_hash: wire.genesis_hash,
    parties: [
      { id: a, pubkey: ka },
      { id: b, pubkey: kb },
    ],
  };
  return normalizeSessionInit(raw);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Decode `{ "init": … }` envelope from the frame byte stream. */
export function sessionInitFromUnknownWireEnvelope(envelope: unknown): SessionInitNormalized {
  if (!isRecord(envelope) || !("init" in envelope)) {
    throw new ObpError("VALIDATION", "expected init envelope");
  }
  return sessionInitFromUnknownWireRecord(envelope.init as Record<string, unknown>);
}

export function sessionInitFromUnknownWireRecord(
  init: Record<string, unknown>,
): SessionInitNormalized {
  const session_id = String(init.session_id ?? "");
  const genesis_hash = String(init.genesis_hash ?? "");
  const partyIds = Array.isArray(init.party_ids) ? init.party_ids : [];
  const keys = Array.isArray(init.actor_pubkeys)
    ? init.actor_pubkeys
    : Array.isArray(init.actors)
      ? init.actors
      : [];
  if (partyIds.length !== 2 || keys.length !== 2) {
    throw new ObpError("VALIDATION", "init requires party_ids[2] and actor_pubkeys[2]");
  }
  return sessionInitFromWire({
    session_id,
    genesis_hash,
    party_ids: [String(partyIds[0]), String(partyIds[1])],
    actor_pubkeys: [String(keys[0]), String(keys[1])],
  });
}
