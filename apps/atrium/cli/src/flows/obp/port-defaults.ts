import type { Offer, Port } from "@khoralabs/obp-v2-model";

/** Minimal shell for `extendOffer`; persistence assigns ids. */
export function shellOffer(type: string): Offer {
  return {
    id: "",
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
    type: port.type ?? "atrium.cli.transition",
    promise: port.promise ?? "(transition)",
    ref: port.ref ?? "",
    sourcemaps: port.sourcemaps ?? [],
  };
}
