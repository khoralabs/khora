/**
 * Apply **`NbcTurnBody`** from a negotiation **TURN** frame through **`ObpPersistenceClient`**
 * (same steps as {@link applyNbcTurn}).
 */

import type { ObpPersistenceClient } from "@khoralabs/obp-persistence";
import type { NbcBindTiming } from "./nbc-invariants";
import { type ApplyNbcTurnParams, type ApplyNbcTurnResult, applyNbcTurn } from "./nbc-turn";
import { type NbcTurnBody, parseNbcTurnBody } from "./nbc-types";

export type ApplyNbcFrameTurnResult = ApplyNbcTurnResult;

/** Parse `Frame.body` (record-shaped JSON) into **`NbcTurnBody`**. */
export function parseNbcFrameTurnBody(body: Record<string, unknown>): NbcTurnBody {
  return parseNbcTurnBody(body);
}

export async function applyNbcFrameTurn(
  client: ObpPersistenceClient,
  partyId: string,
  body: NbcTurnBody,
  timing: NbcBindTiming,
  validateBindPayload?: ApplyNbcTurnParams["validateBindPayload"],
): Promise<ApplyNbcFrameTurnResult> {
  return applyNbcTurn({ partyId, body, client, timing, validateBindPayload });
}

/** Map **`NbcTurnBody`** to legacy flat wire keys expected by older frame materializers. */
export function nbcTurnBodyToWireRecord(body: NbcTurnBody): Record<string, unknown> {
  const o: Record<string, unknown> = {
    offerId: body.offer.id,
    offerType: body.offer.type,
    expires_turn: body.offer.expires_turn,
    expires_at_relay_ms:
      body.offer.expires_at_relay_ms <= Number.MAX_SAFE_INTEGER &&
      body.offer.expires_at_relay_ms >= Number.MIN_SAFE_INTEGER
        ? Number(body.offer.expires_at_relay_ms)
        : String(body.offer.expires_at_relay_ms),
    ports: body.ports.map((p) => ({
      id: p.id,
      type: p.type,
      promise: p.promise,
      expires_turn: p.expires_turn,
      expires_at_relay_ms:
        p.expires_at_relay_ms <= Number.MAX_SAFE_INTEGER &&
        p.expires_at_relay_ms >= Number.MIN_SAFE_INTEGER
          ? Number(p.expires_at_relay_ms)
          : String(p.expires_at_relay_ms),
      bind_policy: p.bind_policy,
      ref: p.ref,
    })),
    bind_port_id: body.bind_port_id,
    bindPortId: body.bind_port_id,
    bind_payload: body.bind_payload,
  };
  return o;
}
