import type { TtlSpec } from "./ttl-spec.ts";

const FAR_FUTURE_SEQ = Number.MAX_SAFE_INTEGER;

/**
 * Port **`expires_seq`** from negotiation TTL at the current ledger sequence.
 * **`turns`** basis defers bind filtering to turn-based rules; store a far-future seq.
 */
export function expiresSeqForPortTtl(atLedgerSeq: number, ttl: TtlSpec): number {
  switch (ttl.basis) {
    case "turns":
      return FAR_FUTURE_SEQ;
    case "ledger_seq":
      return atLedgerSeq + ttl.measure;
    default: {
      const _e: never = ttl.basis;
      return _e;
    }
  }
}

/** Offer **`expires_seq`** for the same TTL policy (default: no early seq-based cap for turns). */
export function expiresSeqForOfferTtl(atLedgerSeq: number, ttl: TtlSpec): number {
  return expiresSeqForPortTtl(atLedgerSeq, ttl);
}
