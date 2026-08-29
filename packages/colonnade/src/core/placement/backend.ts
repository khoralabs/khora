import type { CellPersistence } from "../../persistence/core/cell-persistence";
import type { ColonnadeDatabaseId } from "../database-id";
import type { ColonnadeBackendStrategy } from "./strategy";

/**
 * One strategy instance that can open many principal cell DBs.
 */
export type ColonnadeCellBackend = {
  readonly strategy: ColonnadeBackendStrategy;
  open(id: ColonnadeDatabaseId): CellPersistence;
  delete?(id: ColonnadeDatabaseId): Promise<void> | void;
  close?(): void;
};

export type ColonnadeCellBackendFactory = {
  create(strategy: ColonnadeBackendStrategy): ColonnadeCellBackend;
};

export type CompositeBackendFactoryMap = Record<string, ColonnadeCellBackendFactory>;

export class UnknownBackendStrategyError extends Error {
  constructor(readonly strategy: ColonnadeBackendStrategy) {
    super(`No backend factory registered for strategy kind: ${strategy.kind}`);
    this.name = "UnknownBackendStrategyError";
  }
}

/**
 * Dispatches backend creation by `strategy.kind` so one placement registry can
 * route different homes to different storage implementations (and later remote nodes).
 */
export function createCompositeBackendFactory(
  factories: CompositeBackendFactoryMap,
): ColonnadeCellBackendFactory {
  return {
    create(strategy) {
      const factory = factories[strategy.kind];
      if (factory === undefined) {
        throw new UnknownBackendStrategyError(strategy);
      }
      return factory.create(strategy);
    },
  };
}
