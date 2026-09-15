import type { ResolveCell } from "../persistence/core/cell-persistence";
import { supportsCellBatch } from "../persistence/core/cell-persistence";
import type { FanOutTarget, InboxStagingPayload } from "./colonnade-types";
import { deterministicInboxDeliveryId } from "./hash";
import type { InboxDelivery, InboxDeliveryInput, InboxDeliveryResult } from "./inbox-delivery";

export type ResolveCellInboxDeliveryOptions = {
  readonly observeBatch?: (event: {
    batchIndex: number;
    targets: number;
    active: number;
    durationMs: number;
    outcome: "success" | "failure";
    partitions: number;
  }) => void;
};

/**
 * Compatibility adapter: fan-out via {@link ResolveCell} (current single-host open path).
 * Prefer {@link LocalPlacementInboxDelivery} for placement-backed clusters.
 */
export function createResolveCellInboxDelivery(
  resolveCell: ResolveCell,
  opts: ResolveCellInboxDeliveryOptions = {},
): InboxDelivery {
  return {
    async deliver(input: InboxDeliveryInput): Promise<InboxDeliveryResult> {
      return deliverViaResolveCell(resolveCell, input, opts);
    },
  };
}

export async function deliverViaResolveCell(
  resolveCell: ResolveCell,
  input: InboxDeliveryInput,
  opts: ResolveCellInboxDeliveryOptions = {},
): Promise<InboxDeliveryResult> {
  const { targets } = input;
  const byCell = new Map<string, FanOutTarget[]>();
  for (const target of targets) {
    const list = byCell.get(target.recipient_cell_id);
    if (list === undefined) {
      byCell.set(target.recipient_cell_id, [target]);
    } else {
      list.push(target);
    }
  }

  const success_bitmap = new Uint8Array(Math.ceil(targets.length / 8));
  const started = performance.now();
  const emit = (outcome: "success" | "failure") => {
    try {
      opts.observeBatch?.({
        batchIndex: 0,
        targets: targets.length,
        active: 1,
        durationMs: performance.now() - started,
        outcome,
        partitions: byCell.size,
      });
    } catch {
      /* observability must not change delivery */
    }
  };
  try {
    await Promise.all(
      [...byCell.values()].map(async (cellTargets) => {
        const recipientCellId = cellTargets[0]?.recipient_cell_id;
        if (recipientCellId === undefined) return;
        const cell = resolveCell(recipientCellId);
        const deliveries = cellTargets.map((target) => deliveryFor(input, target));

        if (supportsCellBatch(cell) && deliveries.length > 1) {
          await cell.enqueueInboxDeliveriesBatch(deliveries);
          return;
        }

        for (const delivery of deliveries) await cell.enqueueInboxDelivery(delivery);
      }),
    );
  } catch (error) {
    emit("failure");
    throw error;
  }

  success_bitmap.fill(0xff);
  const remainder = targets.length & 7;
  if (remainder > 0) success_bitmap[success_bitmap.length - 1] = (1 << remainder) - 1;
  emit("success");
  return { target_count: targets.length, delivered_count: targets.length, success_bitmap };
}

function deliveryFor(input: InboxDeliveryInput, target: FanOutTarget) {
  const delivery_id = deterministicInboxDeliveryId({
    tenant_key: input.tenant_key,
    pointer: input.pointer,
    target,
  });
  return {
    cell_id: target.recipient_cell_id,
    tenant_key: input.tenant_key,
    recipient_principal_id: target.recipient_principal_id,
    staging: stagingForTarget(target, input.pointer),
    delivery_id,
    correlation_id: delivery_id,
  };
}

function stagingForTarget(
  target: FanOutTarget,
  pointer: InboxDeliveryInput["pointer"],
): InboxStagingPayload {
  return {
    kind: "pointer",
    pointer: {
      pointer,
      ...(target.inbox_metadata !== undefined ? { metadata: target.inbox_metadata } : {}),
    },
  };
}
