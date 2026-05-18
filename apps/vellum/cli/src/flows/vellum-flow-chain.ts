import type { FlowChainView } from "@khoralabs/cli-flow-nbc";
import { createInMemoryFlowChainView } from "@khoralabs/cli-flow-nbc";
import type { VellumClient } from "@khoralabs/vellum-client";

export type VellumFlowChainViewOptions = {
  /** When set, chain reads may consult room-backed policy/state (future). */
  client?: VellumClient;
  roomId?: string;
  /** Seeds `offerId::portId` → string for {@link FlowChainView#existingStringValue}. */
  seedBinds?: ReadonlyMap<string, string>;
};

/**
 * {@link FlowChainView} for vellum: in-memory or room-backed (stub until persistence is wired).
 */
export function createVellumFlowChainView(options: VellumFlowChainViewOptions = {}): FlowChainView {
  const inner = createInMemoryFlowChainView(options.seedBinds);
  const { client, roomId } = options;

  if (client === undefined && roomId === undefined) {
    return inner;
  }

  return {
    resolveBindPolicy(offerId, port) {
      return inner.resolveBindPolicy(offerId, port);
    },
    existingStringValue(offerId, portId) {
      const seeded = inner.existingStringValue(offerId, portId);
      if (seeded !== undefined) return seeded;
      void client;
      void roomId;
      return undefined;
    },
  };
}
