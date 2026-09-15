import { expect, test } from "bun:test";
import { createResolveCellInboxDelivery } from "./resolve-cell-inbox-delivery";

const pointer = {
  source_cell_id: "cell-a",
  source_record_key: "rk",
  content_hash: "a".repeat(64),
  cell_pool_count: 4,
};

test("resolve-cell delivery observes failure when a cell cannot be resolved", async () => {
  const events: Array<{ outcome: string; durationMs: number }> = [];
  const delivery = createResolveCellInboxDelivery(
    () => {
      throw new Error("missing cell");
    },
    {
      observeBatch: (event) => events.push(event),
    },
  );
  await expect(
    delivery.deliver({
      tenant_key: "t",
      pointer,
      targets: [{ recipient_cell_id: "cell-b", recipient_principal_id: "bob" }],
    }),
  ).rejects.toThrow("missing cell");
  expect(events).toEqual([
    expect.objectContaining({ outcome: "failure", targets: 1, partitions: 1 }),
  ]);
  expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0);
});
