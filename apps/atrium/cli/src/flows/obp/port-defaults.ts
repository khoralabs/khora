import type { Offer, Port } from "@khoralabs/obp-core";

const FAR_FUTURE_SEQ = 9_007_199_254_740_991;

/** Minimal shell for `extendOffer`; persistence assigns ids and stamps seq. */
export function shellOffer(type: string): Offer {
  return {
    id: "",
    created_seq: 0,
    expires_seq: FAR_FUTURE_SEQ,
    type,
    sourcemaps: [],
  };
}

/** Merge user port fields with OBP defaults for `exposePort`. */
export function mergePortShell(port: Partial<Port>): Port {
  const base: Port = {
    id: "",
    created_seq: 0,
    expires_seq: FAR_FUTURE_SEQ,
    type: port.type ?? "atrium.cli.transition",
    promise: port.promise ?? "(transition)",
    max_bindings: port.max_bindings ?? 1,
    terminal: port.terminal ?? false,
    ref: port.ref ?? "",
    sourcemaps: port.sourcemaps ?? [],
    ...(port.bind_policy !== undefined ? { bind_policy: port.bind_policy } : {}),
    ...(port.ttl_basis !== undefined ? { ttl_basis: port.ttl_basis } : {}),
    ...(port.ttl_measure !== undefined ? { ttl_measure: port.ttl_measure } : {}),
  };
  return base;
}
