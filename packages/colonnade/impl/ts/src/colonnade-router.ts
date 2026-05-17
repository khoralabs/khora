import type { ResolveCellStrategy } from "./cell-persistence-strategy.ts";
import type {
  RoutedWrite,
  SubmitRoutedWritesInput,
  SubmitRoutedWritesOutput,
} from "./colonnade-types.ts";
import { supportsSqliteCellBatch } from "./sqlite/sqlite-cell-strategy.ts";

/**
 * Enqueues **`RoutedWrite`** units onto each target cell's durable write log via
 * {@link CellPersistenceStrategy.appendWriteLogEntry}.
 */
export class ColonnadeRouter {
  constructor(private readonly resolveCell: ResolveCellStrategy) {}

  async submitRoutedWrites(input: SubmitRoutedWritesInput): Promise<SubmitRoutedWritesOutput> {
    const byCell = new Map<string, RoutedWrite[]>();
    for (const w of input.writes) {
      const list = byCell.get(w.target_cell_id);
      if (list === undefined) {
        byCell.set(w.target_cell_id, [w]);
      } else {
        list.push(w);
      }
    }

    await Promise.all(
      [...byCell.entries()].map(async ([targetCellId, writes]) => {
        const cell = this.resolveCell(targetCellId);
        const ops = writes.map((w) => ({
          cell_id: w.target_cell_id,
          correlation_id: w.correlation_id,
          op: w.op,
        }));

        if (supportsSqliteCellBatch(cell) && ops.length > 1) {
          await cell.appendWriteLogEntriesBatch(ops);
          return;
        }

        for (const w of writes) {
          await cell.appendWriteLogEntry({
            cell_id: w.target_cell_id,
            correlation_id: w.correlation_id,
            op: w.op,
          });
        }
      }),
    );

    return { accepted_correlation_ids: input.writes.map((w) => w.correlation_id) };
  }
}
