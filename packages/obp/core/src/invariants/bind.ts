import type { Offer, Port } from "../model/types";
import { isOfferValidAt, isPortValidAt } from "./expiry";
import { resolveCanonicalPortId } from "./ref";

export type BindValidationInput = {
  now: number;
  offer: Offer;
  /** Port referenced by bind (by id). */
  port: Port;
  portsById: ReadonlyMap<string, Port>;
  /** True iff some EXPOSES targets `port.id`. */
  targetPortIsExposed: boolean;
  /** Existing BINDS edges `(offerId, portId)`; `portId` is the stored target id. */
  binds: ReadonlyArray<{ offerId: string; portId: string }>;
};

export type BindValidationFailure =
  | { code: "EXPIRED"; entity: "offer" | "port" }
  | { code: "NOT_EXPOSED" }
  | { code: "REF_CYCLE"; path: string[] }
  | { code: "REF_MISSING"; missingId: string }
  | { code: "MAX_BINDINGS"; canonicalId: string; current: number; max: number };

/**
 * Pure check for BindPort / bind leg of ExtendOffer.
 * Returns `null` if the bind is allowed; otherwise a failure value (caller maps to {@link ObpError}).
 */
export function validateBindPreconditions(
  input: BindValidationInput,
): BindValidationFailure | null {
  const { now, offer, port, portsById, targetPortIsExposed, binds } = input;

  if (!isOfferValidAt(offer, now)) {
    return { code: "EXPIRED", entity: "offer" };
  }
  if (!isPortValidAt(port, now)) {
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
  const canonical = portsById.get(canonicalId);
  if (!canonical) {
    return { code: "REF_MISSING", missingId: canonicalId };
  }

  let count = 0;
  for (const b of binds) {
    const r = resolveCanonicalPortId(portsById, b.portId);
    if (r.ok && r.canonicalId === canonicalId) {
      count += 1;
    }
  }

  if (count >= canonical.max_bindings) {
    return {
      code: "MAX_BINDINGS",
      canonicalId,
      current: count,
      max: canonical.max_bindings,
    };
  }

  return null;
}
