import type { CellPersistenceStrategy, ResolveCellStrategy } from "./cell-persistence-strategy.ts";
import type { SubmitRoutedWritesInput, SubmitRoutedWritesOutput } from "./colonnade-types.ts";

/**
 * Enqueues **`RoutedWrite`** units onto each target cell's durable write log via
 * {@link CellPersistenceStrategy.appendWriteLogEntry}.
 */
export class ColonnadeRouter {
  constructor(private readonly resolveCell: ResolveCellStrategy) {}

  async submitRoutedWrites(input: SubmitRoutedWritesInput): Promise<SubmitRoutedWritesOutput> {
    const accepted: string[] = [];
    for (const w of input.writes) {
      const cell = this.resolveCell(w.target_cell_id);
      await cell.appendWriteLogEntry({
        cell_id: w.target_cell_id,
        correlation_id: w.correlation_id,
        op: w.op,
      });
      accepted.push(w.correlation_id);
    }
    return { accepted_correlation_ids: accepted };
  }
}
