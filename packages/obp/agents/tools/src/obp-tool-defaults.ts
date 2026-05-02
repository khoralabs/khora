/** Default **`expires_seq`** offset from current ledger sequence when the agent omits `expires_after_seq`. */
export const DEFAULT_EXPIRY_SEQ_DELTA = 1_000_000;

/** Upper bound for **`expires_after_seq`** relative deltas. */
export const MAX_EXPIRY_SEQ_DELTA = 1_000_000_000;

export function expiresSeqAfterDelta(atLedgerSeq: number, delta: number): number {
  return atLedgerSeq + delta;
}
