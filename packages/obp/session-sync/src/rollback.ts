import type { FakeObpPersistence, FakeObpPersistenceSnapshot } from "@khoralabs/obp-persistence-client";

/** Restore **`persistence`** to a prior exported snapshot (fork rollback helper). */
export function rollbackFakePersistence(
  persistence: FakeObpPersistence,
  snapshot: FakeObpPersistenceSnapshot,
): void {
  persistence.importState(snapshot);
}
