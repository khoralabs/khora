/**
 * Constraints on **`cfd.obp.frame#SessionInit`** (the `{ "init": … }` envelope on the frame byte stream).
 *
 * **Naming:** Smithy calls this structure **`SessionInit`** inside the **frame** model (`frame-protocol.smithy`).
 * That is **not** the same thing as **`cfd.obp.session`** (`SessionEnvelope`, checkpoints, …) in
 * `packages/obp/v2/session/` — different namespace, different job. This file only validates frame-bootstrap
 * wire rules (two parties, pubkey ordering) that the frame spec spells out on **`SessionInit`**.
 *
 * **Why here:** `@khoralabs/obp-v2-frames-impl` owns **`Frame`**, **`SessionInit`**, and framing; helpers belong
 * next to **`frame-protocol-types.ts`**, not in the session impl package.
 */

import type { ActorPubkeyList, SessionInit } from "./frame-protocol-types.ts";

/** Lexicographic compare on strings (binary / UTF-16 code units per `String` `<`). */
export function cmpActorPubkeyHex(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * **`actor_pubkeys`** MUST be sorted ascending (lexicographic on the wire strings;
 * spec references lowercase hex for HTTP/2 binding).
 */
export function isActorPubkeysAscending(pubkeys: ActorPubkeyList): boolean {
  if (pubkeys.length !== 2) {
    return false;
  }
  const [a, b] = pubkeys;
  if (a === undefined || b === undefined) {
    return false;
  }
  return cmpActorPubkeyHex(a, b) < 0;
}

/** `party_ids` and `actor_pubkeys` MUST each have length **two** for bootstrap. */
export function isSessionInitPartyStructure(init: SessionInit): boolean {
  return init.party_ids.length === 2 && init.actor_pubkeys.length === 2;
}
