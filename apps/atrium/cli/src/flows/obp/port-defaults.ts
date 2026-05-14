import type { Offer, Port } from "@khoralabs/obp-v2-model";

const FAR_FUTURE_SEQ = 9_007_199_254_740_991n;

/** Minimal shell for `extendOffer`; persistence assigns ids. */
export function shellOffer(type: string): Offer {
  return {
    id: "",
    expires_seq: FAR_FUTURE_SEQ,
    type,
    sourcemaps: [],
  };
}

/** Merge user port fields with defaults for `exposePort` (thin `cfd.obp#Port`). */
export function mergePortShell(
  port: Partial<Pick<Port, "promise" | "type" | "ref" | "sourcemaps">>,
): Port {
  return {
    id: "",
    expires_seq: FAR_FUTURE_SEQ,
    type: port.type ?? "atrium.cli.transition",
    promise: port.promise ?? "(transition)",
    ref: port.ref ?? "",
    sourcemaps: port.sourcemaps ?? [],
  };
}
