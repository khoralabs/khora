import type { Offer, Port } from "../model/types";

/** Valid iff **`ledger_seq < expires_seq`** on the offer (exclusive upper bound). */
export function isOfferValidAtLedgerSeq(offer: Offer, ledgerSeq: number): boolean {
  return ledgerSeq < offer.expires_seq;
}

/** Valid iff **`ledger_seq < expires_seq`** on the port (exclusive upper bound). */
export function isPortValidAtLedgerSeq(port: Port, ledgerSeq: number): boolean {
  return ledgerSeq < port.expires_seq;
}
