import type { ResolveCell } from "../persistence/core/cell-persistence";
import { supportsCellBatch } from "../persistence/core/cell-persistence";
import type { FanOutTarget, GeneratedInboxRef, InboxStagingPayload } from "./colonnade-types";
import { randomId } from "./hash";
import type { InboxDelivery, InboxDeliveryInput, InboxDeliveryResult } from "./inbox-delivery";

/**
 * Compatibility adapter: fan-out via {@link ResolveCell} (current single-host open path).
 * Prefer {@link LocalPlacementInboxDelivery} for placement-backed clusters.
 */
export function createResolveCellInboxDelivery(resolveCell: ResolveCell): InboxDelivery {
  return {
    async deliver(input: InboxDeliveryInput): Promise<InboxDeliveryResult> {
      return deliverViaResolveCell(resolveCell, input);
    },
  };
}

export async function deliverViaResolveCell(
  resolveCell: ResolveCell,
  input: InboxDeliveryInput,
): Promise<InboxDeliveryResult> {
  const { pointer, targets, tenant_key: tenantKey } = input;
  const byCell = new Map<string, FanOutTarget[]>();
  for (const target of targets) {
    const list = byCell.get(target.recipient_cell_id);
    if (list === undefined) {
      byCell.set(target.recipient_cell_id, [target]);
    } else {
      list.push(target);
    }
  }

  const inboxIdsByCell = new Map<string, string[]>();

  await Promise.all(
    [...byCell.entries()].map(async ([recipientCellId, cellTargets]) => {
      const cell = resolveCell(recipientCellId);
      const deliveries = cellTargets.map((target) => ({
        cell_id: target.recipient_cell_id,
        tenant_key: tenantKey,
        recipient_principal_id: target.recipient_principal_id,
        staging: stagingForTarget(target, pointer),
        correlation_id: randomId("fan"),
      }));

      if (supportsCellBatch(cell) && deliveries.length > 1) {
        const outs = await cell.enqueueInboxDeliveriesBatch(deliveries);
        inboxIdsByCell.set(
          recipientCellId,
          outs.map((o) => o.inbox_entry_id),
        );
        return;
      }

      const ids: string[] = [];
      for (const target of cellTargets) {
        const out = await cell.enqueueInboxDelivery({
          cell_id: target.recipient_cell_id,
          tenant_key: tenantKey,
          recipient_principal_id: target.recipient_principal_id,
          staging: stagingForTarget(target, pointer),
          correlation_id: randomId("fan"),
        });
        ids.push(out.inbox_entry_id);
      }
      inboxIdsByCell.set(recipientCellId, ids);
    }),
  );

  const refs: GeneratedInboxRef[] = [];
  for (const target of targets) {
    const ids = inboxIdsByCell.get(target.recipient_cell_id);
    const inbox_entry_id = ids?.shift();
    if (inbox_entry_id === undefined) {
      throw new Error("InboxDelivery: missing inbox enqueue result for fan-out target");
    }
    refs.push({
      inbox_entry_id,
      recipient_cell_id: target.recipient_cell_id,
      recipient_principal_id: target.recipient_principal_id,
    });
  }
  return { generated_inbox_refs: refs };
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
