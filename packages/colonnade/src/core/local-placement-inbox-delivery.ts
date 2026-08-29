import type { CellPersistence } from "../persistence/core/cell-persistence";
import type { InboxDelivery, InboxDeliveryInput } from "./inbox-delivery";
import { decodeCellId } from "./owner-key-encoder";
import type { ColonnadeCellBackendResolver } from "./placement";
import { deliverViaResolveCell } from "./resolve-cell-inbox-delivery";

export type LocalPlacementInboxDeliveryOptions = {
  readonly resolver: ColonnadeCellBackendResolver;
  /**
   * Optional sync resolve for already-open cells (e.g. cluster Map cache).
   * When omitted, opens via {@link ColonnadeCellBackendResolver.open}.
   */
  readonly resolveOpenCell?: (cellId: string) => CellPersistence | undefined;
};

/**
 * Single-host / Turso InboxDelivery adapter: placement-resolves recipient homes,
 * pins opens for the deliver batch, then reuses {@link deliverViaResolveCell}.
 *
 * At scale this adapter is replaced by multiplexed sessions over cell pools/nodes
 * coordinated with a catalog host — publication still calls {@link InboxDelivery.deliver}.
 */
export function createLocalPlacementInboxDelivery(
  opts: LocalPlacementInboxDeliveryOptions,
): InboxDelivery {
  return {
    async deliver(input: InboxDeliveryInput) {
      const cellIds = [...new Set(input.targets.map((t) => t.recipient_cell_id))];
      const pinned = new Map<string, CellPersistence>();

      await Promise.all(
        cellIds.map(async (cellId) => {
          const cached = opts.resolveOpenCell?.(cellId);
          if (cached !== undefined) {
            pinned.set(cellId, cached);
            return;
          }
          const id = decodeCellId(cellId);
          pinned.set(cellId, await opts.resolver.open(id));
        }),
      );

      return deliverViaResolveCell((cellId) => {
        const cell = pinned.get(cellId);
        if (cell === undefined) {
          throw new Error(`LocalPlacementInboxDelivery: missing pin for ${cellId}`);
        }
        return cell;
      }, input);
    },
  };
}
