import type { NonceStore } from "./nonce-store";

/** In-memory {@link NonceStore} for tests and embedders without durable storage. */
export function createMemoryNonceStore(): NonceStore {
  const rows = new Map<string, number>();
  const key = (did: string, nonce: string) => `${did}\0${nonce}`;
  return {
    tryInsert(p) {
      const k = key(p.did, p.nonce);
      if (rows.has(k)) return false;
      rows.set(k, p.expiresAtMs);
      return true;
    },
    sweepExpired(nowMs) {
      let removed = 0;
      for (const [k, exp] of rows) {
        if (exp <= nowMs) {
          rows.delete(k);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
