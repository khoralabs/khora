import { describe, expect, test } from "bun:test";
import type { NonceStore } from "./nonce-store";

/** Shared contract suite — host SQLite (and other) stores should call this with their factory. */
export function runNonceStoreContractTests(createStore: () => NonceStore): void {
  describe("NonceStore contract", () => {
    test("inserts unique (did, nonce) pairs", () => {
      const store = createStore();
      expect(store.tryInsert({ did: "did:key:a", nonce: "n1", expiresAtMs: 1_000 })).toBe(true);
      expect(store.tryInsert({ did: "did:key:a", nonce: "n2", expiresAtMs: 1_000 })).toBe(true);
      expect(store.tryInsert({ did: "did:key:b", nonce: "n1", expiresAtMs: 1_000 })).toBe(true);
    });

    test("rejects duplicate (did, nonce)", () => {
      const store = createStore();
      expect(store.tryInsert({ did: "did:key:a", nonce: "n1", expiresAtMs: 1_000 })).toBe(true);
      expect(store.tryInsert({ did: "did:key:a", nonce: "n1", expiresAtMs: 2_000 })).toBe(false);
    });

    test("sweepExpired deletes only expired rows", () => {
      const store = createStore();
      store.tryInsert({ did: "did:key:a", nonce: "n1", expiresAtMs: 100 });
      store.tryInsert({ did: "did:key:a", nonce: "n2", expiresAtMs: 300 });
      expect(store.sweepExpired(200)).toBe(1);
      expect(store.tryInsert({ did: "did:key:a", nonce: "n1", expiresAtMs: 400 })).toBe(true);
      expect(store.tryInsert({ did: "did:key:a", nonce: "n2", expiresAtMs: 400 })).toBe(false);
    });
  });
}
