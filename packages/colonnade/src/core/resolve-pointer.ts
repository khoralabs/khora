import type { ContentAddressedStore, ResolvedSource, Store } from "@khoralabs/sourcemaps";
import { resolveSourcemap } from "@khoralabs/sourcemaps";

import type { CellPersistence } from "../persistence/core/cell-persistence";
import type {
  OutboxContentRef,
  OutboxLocators,
  PointerRef,
  SourceMapEntryRef,
} from "./colonnade-types";
import { assertContentHash, sha256HexLower } from "./hash";

export type { OutboxContentRef, OutboxLocators, PointerRef, ResolvedSource, SourceMapEntryRef };
export { resolveSourcemap };

export interface OutboxStore extends Store<OutboxLocators> {}

export interface PointerStore extends ContentAddressedStore<PointerRef> {}

/** Outbox row bytes were erased at source (ghost). */
export class OutboxGhostError extends Error {
  constructor(readonly locators: OutboxLocators) {
    super(`Colonnade: outbox ghost (${locators.cell_id}/${locators.record_key})`);
    this.name = "OutboxGhostError";
  }
}

/** Fetched bytes do not match `PointerRef.content_hash`. */
export class PointerHashMismatchError extends Error {
  constructor(readonly ref: PointerRef) {
    super(
      `Colonnade: pointer content_hash mismatch (${ref.source_cell_id}/${ref.source_record_key})`,
    );
    this.name = "PointerHashMismatchError";
  }
}

/** Ref `cell_pool_count` does not match the running cluster pool size. */
export class CellPoolCountMismatchError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`Colonnade: cell_pool_count mismatch (expected ${expected}, ref has ${actual})`);
    this.name = "CellPoolCountMismatchError";
  }
}

function assertPoolCount(expectedPoolCount: number, actual: number): void {
  if (actual !== expectedPoolCount) {
    throw new CellPoolCountMismatchError(expectedPoolCount, actual);
  }
}

export function createOutboxLocatorStore(
  cell: CellPersistence,
  expectedPoolCount: number,
): OutboxStore {
  return {
    async resolve(locators: OutboxLocators): Promise<ResolvedSource> {
      assertPoolCount(expectedPoolCount, locators.cell_pool_count);
      const fetched = await cell.fetchOutboxPayload({
        cell_id: locators.cell_id,
        locator: locators,
        payload_format: "plaintext",
      });
      if (!fetched.bytes_available) {
        throw new OutboxGhostError(locators);
      }
      return { kind: "blob", blob: new Blob([Uint8Array.from(fetched.payload_bytes)]) };
    },
  };
}

export function createPointerStore(cell: CellPersistence, expectedPoolCount: number): PointerStore {
  return {
    async resolve(ref: PointerRef): Promise<ResolvedSource> {
      assertContentHash(ref.content_hash);
      assertPoolCount(expectedPoolCount, ref.cell_pool_count);
      const locators: OutboxLocators = {
        cell_id: ref.source_cell_id,
        record_key: ref.source_record_key,
        cell_pool_count: ref.cell_pool_count,
      };
      const fetched = await cell.fetchOutboxPayload({
        cell_id: ref.source_cell_id,
        locator: locators,
        payload_format: "stored",
      });
      if (!fetched.bytes_available) {
        throw new OutboxGhostError(locators);
      }
      const hash = sha256HexLower(fetched.payload_bytes);
      if (hash !== ref.content_hash) {
        throw new PointerHashMismatchError(ref);
      }
      return { kind: "blob", blob: new Blob([Uint8Array.from(fetched.payload_bytes)]) };
    },
  };
}
