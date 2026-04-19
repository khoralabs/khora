import { parsePriceFromType } from "@cfd/obp-tools";

/**
 * Encode negotiation payloads in OBP `type` strings (public graph field).
 * v2 is multi-issue: price `p` and contract term (months) `s`.
 * Format: `demo.negotiation.v2|p=<price>|s=<months>|t=<url-encoded text>`
 * Deal terminal: `demo.deal.v2|p=<price>|s=<months>`
 */
const PREFIX_NEG_V2 = "demo.negotiation.v2";
const PREFIX_DEAL_V2 = "demo.deal.v2";

export function formatNegotiationType(price: number, termMonths: number, text: string): string {
  const t = encodeURIComponent(text.slice(0, 200));
  return `${PREFIX_NEG_V2}|p=${price}|s=${termMonths}|t=${t}`;
}

export function formatDealTerminalType(price: number, termMonths: number): string {
  return `${PREFIX_DEAL_V2}|p=${price}|s=${termMonths}`;
}

/** Extract contract length in whole months from demo `type` strings (`|s=`). */
export function parseTermMonthsFromType(type: string): number | null {
  const m = /\|s=(\d+)/.exec(type);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a terminal deal port: requires `demo.deal.v2` with both price and term.
 */
export function parseDealPackage(type: string): { price: number; termMonths: number } | null {
  if (!type.startsWith(PREFIX_DEAL_V2)) return null;
  const price = parsePriceFromType(type);
  const termMonths = parseTermMonthsFromType(type);
  if (price === null || termMonths === null) return null;
  return { price, termMonths };
}

export function parsePublicText(type: string): string {
  const m = /\|t=([^|]+)/.exec(type);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}
