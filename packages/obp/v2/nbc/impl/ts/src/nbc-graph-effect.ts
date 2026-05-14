/**
 * Apply **`NbcTurnBody`** from a negotiation **TURN** frame through **`ObpPersistenceClient`**
 * (same steps as {@link applyNbcTurn}).
 */

import type { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { type ApplyNbcTurnParams, type ApplyNbcTurnResult, applyNbcTurn } from "./nbc-turn.ts";
import { type NbcTurnBody, parseNbcTurnBody } from "./nbc-types.ts";

export type ApplyNbcFrameTurnResult = ApplyNbcTurnResult;

/** Parse `Frame.body` (record-shaped JSON) into **`NbcTurnBody`**. */
export function parseNbcFrameTurnBody(body: Record<string, unknown>): NbcTurnBody {
  return parseNbcTurnBody(body);
}

export async function applyNbcFrameTurn(
  client: ObpPersistenceClient,
  partyId: string,
  body: NbcTurnBody,
  ledgerSeq: bigint,
  getBindPolicyForPort?: ApplyNbcTurnParams["getBindPolicyForPort"],
): Promise<ApplyNbcFrameTurnResult> {
  return applyNbcTurn({ partyId, body, client, ledgerSeq, getBindPolicyForPort });
}

/** Map **`NbcTurnBody`** to legacy flat wire keys expected by older frame materializers. */
export function nbcTurnBodyToWireRecord(body: NbcTurnBody): Record<string, unknown> {
  const exp = body.offer.expires_seq;
  const expiresWire =
    exp <= BigInt(Number.MAX_SAFE_INTEGER) && exp >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(exp)
      : String(exp);
  const o: Record<string, unknown> = {
    offerId: body.offer.id,
    offerType: body.offer.type,
    expires_seq: expiresWire,
    sourcemaps: body.offer.sourcemaps,
    ports: body.ports.map((p) => ({
      id: p.id,
      type: p.type,
      promise: p.promise,
      expires_seq:
        p.expires_seq <= BigInt(Number.MAX_SAFE_INTEGER) &&
        p.expires_seq >= BigInt(Number.MIN_SAFE_INTEGER)
          ? Number(p.expires_seq)
          : String(p.expires_seq),
      bind_policy: p.bind_policy,
      ref: p.ref,
    })),
    bind_port_id: body.bind_port_id,
    bindPortId: body.bind_port_id,
    bind_payload: body.bind_payload,
  };
  return o;
}
