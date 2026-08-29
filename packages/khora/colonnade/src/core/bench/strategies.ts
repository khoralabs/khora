import { createTestOutboxPayloadCodec } from "../../crypto";
import type { CatalogPersistence } from "../../persistence/core/catalog-persistence";
import type { CellPersistence, ResolveCell } from "../../persistence/core/cell-persistence";
import { InMemoryCatalogPersistence } from "../../persistence/core/in-memory-catalog-persistence";
import { InMemoryCellPersistence } from "../../persistence/core/in-memory-cell-persistence";
import {
  createSqliteBenchmarkStrategies,
  type SqliteBenchmarkStrategiesOptions,
} from "../../persistence/sqlite";

/**
 * Factories for comparing persistence backends under the same workloads.
 * Implement `createCatalog` / `createResolveCell` for SQLite, HTTP, etc.
 */
export type BenchmarkStrategies = {
  readonly createCatalog: () => CatalogPersistence;
  /** One logical cell store per id (typical: one DB file / pool per shard). */
  readonly createResolveCell: (cellIds: readonly string[]) => ResolveCell;
  /** Release resources after a scenario (e.g. SQLite temp dirs). Optional for in-memory. */
  readonly teardown?: () => void;
};

export function createDefaultBenchmarkStrategies(): BenchmarkStrategies {
  const codec = createTestOutboxPayloadCodec();
  return {
    createCatalog: () => new InMemoryCatalogPersistence(),
    createResolveCell: (cellIds: readonly string[]) => {
      const map = new Map<string, CellPersistence>(
        cellIds.map((id) => [id, new InMemoryCellPersistence(id, { outboxPayloadCodec: codec })]),
      );
      return (cellId: string) => {
        const s = map.get(cellId);
        if (s === undefined) {
          throw new Error(`BenchmarkStrategies: unknown cell id ${cellId}`);
        }
        return s;
      };
    },
  };
}

const registry = new Map<string, () => BenchmarkStrategies>([
  ["default", createDefaultBenchmarkStrategies],
]);

export function registerBenchmarkStrategies(
  name: string,
  factory: () => BenchmarkStrategies,
): void {
  registry.set(name, factory);
}

export type GetBenchmarkStrategiesOptions = {
  readonly sqlite?: SqliteBenchmarkStrategiesOptions;
};

export function getBenchmarkStrategies(
  name: string,
  opts?: GetBenchmarkStrategiesOptions,
): BenchmarkStrategies {
  if (name === "sqlite") {
    return createSqliteBenchmarkStrategies(opts?.sqlite);
  }
  const f = registry.get(name);
  if (f === undefined) {
    throw new Error(
      `Unknown --strategy ${name} (known: sqlite, ${[...registry.keys()].join(", ")})`,
    );
  }
  return f();
}
