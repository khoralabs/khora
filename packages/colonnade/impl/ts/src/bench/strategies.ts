import { createTestOutboxPayloadCodec } from "@khoralabs/sqlite-crypto";
import type { CatalogPersistenceStrategy } from "../catalog-persistence-strategy";
import type { CellPersistenceStrategy, ResolveCellStrategy } from "../cell-persistence-strategy";
import { InMemoryCatalogPersistenceStrategy } from "../in-memory-catalog-strategy";
import { InMemoryCellPersistenceStrategy } from "../in-memory-cell-strategy";
import {
  createSqliteBenchmarkStrategies,
  type SqliteBenchmarkStrategiesOptions,
} from "./sqlite-strategies";

/**
 * Factories for comparing persistence backends under the same workloads.
 * Implement `createCatalog` / `createResolveCell` for SQLite, HTTP, etc.
 */
export type BenchmarkStrategies = {
  readonly createCatalog: () => CatalogPersistenceStrategy;
  /** One logical cell store per id (typical: one DB file / pool per shard). */
  readonly createResolveCell: (cellIds: readonly string[]) => ResolveCellStrategy;
  /** Release resources after a scenario (e.g. SQLite temp dirs). Optional for in-memory. */
  readonly teardown?: () => void;
};

export function createDefaultBenchmarkStrategies(): BenchmarkStrategies {
  const codec = createTestOutboxPayloadCodec();
  return {
    createCatalog: () => new InMemoryCatalogPersistenceStrategy(),
    createResolveCell: (cellIds: readonly string[]) => {
      const map = new Map<string, CellPersistenceStrategy>(
        cellIds.map((id) => [
          id,
          new InMemoryCellPersistenceStrategy(id, { outboxPayloadCodec: codec }),
        ]),
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
