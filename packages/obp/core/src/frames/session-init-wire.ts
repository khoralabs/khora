import { ObpError } from "../persistence/client/errors.ts";
import type { SessionInit, SessionParty } from "./types.ts";

/** Wire shape for `init` in canonical JSON (Smithy `cfd.obp.frame`). */
export type SessionInitWire = {
  session_id: string;
  party_ids: [string, string];
  actor_pubkeys: [string, string];
  genesis_hash: string;
};

function cmpPubkeyHex(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Sort two session participants by ascending signing pubkey (hex). Preserves id↔pubkey pairing. */
export function canonicalSessionParties(pair: [SessionParty, SessionParty]): [SessionParty, SessionParty] {
  const [x, y] = pair;
  if (x.pubkey === y.pubkey) {
    throw new ObpError("VALIDATION", "session parties must have distinct pubkeys");
  }
  return cmpPubkeyHex(x.pubkey, y.pubkey) <= 0 ? [x, y] : [y, x];
}

/** Return a copy with {@link SessionInit.parties} in canonical pubkey order. */
export function normalizeSessionInit(init: SessionInit): SessionInit {
  return {
    session_id: init.session_id,
    genesis_hash: init.genesis_hash,
    parties: canonicalSessionParties(init.parties),
  };
}

/** Graph party id for the frame signer; normalizes `init` internally. */
export function partyIdForSigner(init: SessionInit, signerActor: string): string {
  const n = normalizeSessionInit(init);
  const p = n.parties.find((x) => x.pubkey === signerActor);
  if (p === undefined) {
    throw new ObpError("VALIDATION", `signer.actor ${signerActor} not in session parties`);
  }
  return p.id;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export function sessionInitToWire(init: SessionInit): SessionInitWire {
  const n = normalizeSessionInit(init);
  return {
    session_id: n.session_id,
    party_ids: [n.parties[0].id, n.parties[1].id],
    actor_pubkeys: [n.parties[0].pubkey, n.parties[1].pubkey],
    genesis_hash: n.genesis_hash,
  };
}

export function sessionInitFromWire(wire: SessionInitWire): SessionInit {
  const raw: SessionInit = {
    session_id: wire.session_id,
    genesis_hash: wire.genesis_hash,
    parties: [
      { id: wire.party_ids[0], pubkey: wire.actor_pubkeys[0] },
      { id: wire.party_ids[1], pubkey: wire.actor_pubkeys[1] },
    ],
  };
  return normalizeSessionInit(raw);
}

/** Decode `{ "init": … }` envelope from the frame byte stream. */
export function sessionInitFromUnknownWireEnvelope(envelope: unknown): SessionInit {
  if (!isRecord(envelope) || !("init" in envelope)) {
    throw new ObpError("VALIDATION", "expected init envelope");
  }
  return sessionInitFromUnknownWireRecord(envelope.init as Record<string, unknown>);
}

export function sessionInitFromUnknownWireRecord(init: Record<string, unknown>): SessionInit {
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
