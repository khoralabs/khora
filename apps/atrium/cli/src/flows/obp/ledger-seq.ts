/** Monotonic ledger sequence for OBP single-party CLI sessions. */
export function createMonotonicLedgerSeq(): () => number {
  let n = 0;
  return () => {
    n += 1;
    return n;
  };
}
