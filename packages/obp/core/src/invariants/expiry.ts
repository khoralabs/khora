import type { Offer, Port } from "../model/types";

/** Valid iff `now < ts_expired` (exclusive upper bound). */
export function isOfferValidAt(offer: Offer, now: number): boolean {
  return now < offer.ts_expired;
}

/** Valid iff `now < ts_expired`. */
export function isPortValidAt(port: Port, now: number): boolean {
  return now < port.ts_expired;
}
