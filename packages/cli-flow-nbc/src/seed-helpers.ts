import type { FlowRunResult } from "./runner.ts";

const OFFER_PORT_SEP = "::";

/** Build `offerId::portId` keys for {@link RunFlowOptions#seedStringValues}; skips empty / undefined. */
export function seedMapFromOffer(
  offerId: string,
  partial: Readonly<Record<string, string | undefined>>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const [portId, v] of Object.entries(partial)) {
    const t = v?.trim();
    if (t !== undefined && t.length > 0) {
      m.set(`${offerId}${OFFER_PORT_SEP}${portId}`, t);
    }
  }
  return m;
}

/** Row for one offer after {@link runFlow}; throws if the offer id is missing. */
export function getOfferRow(
  result: FlowRunResult,
  offerId: string,
): Record<string, string | undefined> {
  const row = result.valuesByOffer[offerId];
  if (row === undefined) {
    throw new Error(`flow missing offer "${offerId}"`);
  }
  return row;
}
