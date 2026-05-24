/**
 * Bilateral NBC bind-time checks: N1 (expiry), N3 (ref chain), N4 (bind policy).
 * No **`max_bindings`** / contention logic.
 */

import { ObpError } from "@khoralabs/obp-v2-errors";
import type { JsonDocument, Offer, Port } from "@khoralabs/obp-v2-model";
import type { ObpNbcBindWindow } from "@khoralabs/obp-v2-persistence";
import { resolveCanonicalPortId } from "./nbc-ref.ts";

export type NbcBindFailure =
  | { code: "EXPIRED"; entity: "offer" | "port" }
  | { code: "NOT_EXPOSED" }
  | { code: "REF_CYCLE"; path: readonly string[] }
  | { code: "REF_MISSING"; missingId: string }
  | { code: "POLICY_REJECTED"; reason: string };

export type NbcBindTiming = {
  /** DAG-committed frame count on this chain before applying the binding TURN. */
  turnSeq: number;
  /** `relay_ts_ms` from `khora.agent.relay#RelayEnvelope` when hub relay is in use; `0` when unset (direct / tests). */
  relayTsMs: number;
};

/**
 * Host-supplied bind payload validation for NBC N4 when **`bind_policy`** is active.
 * Must throw **`ObpError`** with code **`VALIDATION`** on rejection.
 * Returns normalized **`Document`** for persistence (Standard Schema output).
 */
export type NbcBindPolicyValidateFn = (
  bindPolicy: JsonDocument | null,
  bindPayload: JsonDocument | null,
) => JsonDocument | Promise<JsonDocument>;

export type ValidateNbcBindInput = {
  timing: NbcBindTiming;
  offer: Offer;
  port: Port;
  offerBindWindow: ObpNbcBindWindow;
  portBindWindow: ObpNbcBindWindow;
  portsById: ReadonlyMap<string, Port>;
  targetPortIsExposed: boolean;
  /** Policy in effect for this port at expose time; `null` / empty object skips N4 schema. */
  bindPolicy: JsonDocument | null;
  bindPayload: JsonDocument | null;
  /** Required when {@link bindPolicy} is active (non-empty object). */
  validateBindPayload?: NbcBindPolicyValidateFn | undefined;
};

export type ValidateNbcBindResult =
  | { readonly ok: true; readonly normalizedBindPayload: JsonDocument }
  | { readonly ok: false; readonly failure: NbcBindFailure };

/** N1 turn mode: bindable when **`expires_turn === 0`** or **`turnSeq < expires_turn`**. */
export function isTurnExpiryOk(expires_turn: number, turnSeq: number): boolean {
  if (expires_turn === 0) return true;
  return turnSeq < expires_turn;
}

/** N1 relay mode: bindable when **`expires_at_relay_ms === 0`** or **`relayTsMs < expires_at_relay_ms`**. */
export function isRelayExpiryOk(expires_at_relay_ms: number, relayTsMs: number): boolean {
  if (expires_at_relay_ms === 0) return true;
  if (relayTsMs === 0) return false;
  return relayTsMs < expires_at_relay_ms;
}

/** True when **`bind_policy`** is a non-empty object (N4 applies). */
export function isActiveBindPolicy(policy: JsonDocument | null): policy is JsonDocument {
  if (policy === null) return false;
  if (typeof policy !== "object" || Array.isArray(policy)) return false;
  return Object.keys(policy as object).length > 0;
}

function assertBindPayloadEmptyWhenInactive(bindPayload: JsonDocument | null): void {
  if (bindPayload === undefined || bindPayload === null) {
    return;
  }
  if (typeof bindPayload !== "object" || Array.isArray(bindPayload)) {
    throw new ObpError(
      "VALIDATION",
      "bind_payload must be omitted or empty when port has no bind_policy",
    );
  }
  if (Object.keys(bindPayload as object).length > 0) {
    throw new ObpError(
      "VALIDATION",
      "bind_payload must be omitted or empty when port has no bind_policy",
    );
  }
}

/**
 * Pure bind validation for bilateral NBC.
 */
export async function validateNbcBind(input: ValidateNbcBindInput): Promise<ValidateNbcBindResult> {
  const {
    timing,
    offerBindWindow,
    portBindWindow,
    port,
    portsById,
    targetPortIsExposed,
    bindPolicy,
    bindPayload,
    validateBindPayload,
  } = input;
  const { turnSeq, relayTsMs } = timing;

  if (!isTurnExpiryOk(offerBindWindow.nbc_expires_turn, turnSeq)) {
    return { ok: false, failure: { code: "EXPIRED", entity: "offer" } };
  }
  if (!isRelayExpiryOk(offerBindWindow.nbc_expires_at_relay_ms, relayTsMs)) {
    return { ok: false, failure: { code: "EXPIRED", entity: "offer" } };
  }
  if (!isTurnExpiryOk(portBindWindow.nbc_expires_turn, turnSeq)) {
    return { ok: false, failure: { code: "EXPIRED", entity: "port" } };
  }
  if (!isRelayExpiryOk(portBindWindow.nbc_expires_at_relay_ms, relayTsMs)) {
    return { ok: false, failure: { code: "EXPIRED", entity: "port" } };
  }

  if (!targetPortIsExposed) {
    return { ok: false, failure: { code: "NOT_EXPOSED" } };
  }

  const resolved = resolveCanonicalPortId(portsById, port.id);
  if (!resolved.ok) {
    if (resolved.reason === "cycle") {
      return { ok: false, failure: { code: "REF_CYCLE", path: resolved.path } };
    }
    return { ok: false, failure: { code: "REF_MISSING", missingId: resolved.missingId } };
  }

  const canonicalId = resolved.canonicalId;
  if (!portsById.has(canonicalId)) {
    return { ok: false, failure: { code: "REF_MISSING", missingId: canonicalId } };
  }

  if (!isActiveBindPolicy(bindPolicy)) {
    try {
      assertBindPayloadEmptyWhenInactive(bindPayload);
    } catch (e) {
      if (e instanceof ObpError && e.code === "VALIDATION") {
        return { ok: false, failure: { code: "POLICY_REJECTED", reason: e.message } };
      }
      throw e;
    }
    return { ok: true, normalizedBindPayload: bindPayload };
  }

  if (validateBindPayload === undefined) {
    return {
      ok: false,
      failure: {
        code: "POLICY_REJECTED",
        reason:
          "active bind_policy requires validateBindPayload (host bind policy validator not configured)",
      },
    };
  }

  try {
    const normalizedBindPayload = await validateBindPayload(bindPolicy, bindPayload);
    return { ok: true, normalizedBindPayload };
  } catch (e) {
    if (e instanceof ObpError && e.code === "VALIDATION") {
      return { ok: false, failure: { code: "POLICY_REJECTED", reason: e.message } };
    }
    throw e;
  }
}
