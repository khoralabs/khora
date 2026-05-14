/**
 * Bilateral NBC bind-time checks: N1 (expiry), N3 (ref chain), N4 (bind policy).
 * No **`max_bindings`** / contention logic.
 */

import { ObpError } from "@khoralabs/obp-v2-errors";
import type { JsonDocument, Offer, Port } from "@khoralabs/obp-v2-model";
import { validateBindPayloadForPort } from "./nbc-bind-policy-validate.ts";
import { resolveCanonicalPortId } from "./nbc-ref.ts";

export type NbcBindFailure =
  | { code: "EXPIRED"; entity: "offer" | "port" }
  | { code: "NOT_EXPOSED" }
  | { code: "REF_CYCLE"; path: readonly string[] }
  | { code: "REF_MISSING"; missingId: string }
  | { code: "POLICY_REJECTED"; reason: string };

export type ValidateNbcBindInput = {
  ledgerSeq: bigint;
  offer: Offer;
  port: Port;
  portsById: ReadonlyMap<string, Port>;
  targetPortIsExposed: boolean;
  /** Policy in effect for this port at expose time; `null` / empty object skips N4 schema. */
  bindPolicy: JsonDocument | null;
  bindPayload: JsonDocument | null;
};

/** N1: valid when **`expires_seq === 0n`** (unset) or **`ledgerSeq < expires_seq`**. */
export function isValidAtLedgerSeq(expires_seq: bigint, ledgerSeq: bigint): boolean {
  if (expires_seq === 0n) return true;
  return ledgerSeq < expires_seq;
}

/** True when **`bind_policy`** is a non-empty object (N4 applies). */
export function isActiveBindPolicy(policy: JsonDocument | null): policy is JsonDocument {
  if (policy === null) return false;
  if (typeof policy !== "object" || Array.isArray(policy)) return false;
  return Object.keys(policy as object).length > 0;
}

/**
 * Pure bind validation for bilateral NBC. Returns **`null`** when allowed.
 */
export async function validateNbcBind(input: ValidateNbcBindInput): Promise<NbcBindFailure | null> {
  const { ledgerSeq, offer, port, portsById, targetPortIsExposed, bindPolicy, bindPayload } = input;

  if (!isValidAtLedgerSeq(offer.expires_seq, ledgerSeq)) {
    return { code: "EXPIRED", entity: "offer" };
  }
  if (!isValidAtLedgerSeq(port.expires_seq, ledgerSeq)) {
    return { code: "EXPIRED", entity: "port" };
  }

  if (!targetPortIsExposed) {
    return { code: "NOT_EXPOSED" };
  }

  const resolved = resolveCanonicalPortId(portsById, port.id);
  if (!resolved.ok) {
    if (resolved.reason === "cycle") {
      return { code: "REF_CYCLE", path: resolved.path };
    }
    return { code: "REF_MISSING", missingId: resolved.missingId };
  }

  const canonicalId = resolved.canonicalId;
  if (!portsById.has(canonicalId)) {
    return { code: "REF_MISSING", missingId: canonicalId };
  }

  try {
    validateBindPayloadForPort(bindPolicy, bindPayload);
  } catch (e) {
    if (e instanceof ObpError && e.code === "VALIDATION") {
      return { code: "POLICY_REJECTED", reason: e.message };
    }
    throw e;
  }

  return null;
}
