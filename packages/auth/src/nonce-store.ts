/**
 * Replay-protection store for `(did, nonce)` pairs. Implementations must reject duplicates and
 * may opportunistically prune expired rows from `sweepExpired`. Methods may be synchronous —
 * `KhoraDidAuth` awaits them either way.
 */
export interface NonceStore {
  /** Insert a fresh `(did, nonce)` pair; return `false` on duplicate (replay). */
  tryInsert(p: { did: string; nonce: string; expiresAtMs: number }): boolean | Promise<boolean>;
  /** Delete nonces past their expiry; returns the number removed. Safe to call opportunistically. */
  sweepExpired(nowMs: number): number | Promise<number>;
}
