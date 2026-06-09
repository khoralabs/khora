import type { FlowChainView } from "@khoralabs/cli-flow-nbc";
import { createInMemoryFlowChainView } from "@khoralabs/cli-flow-nbc";
import type { VellumClient } from "@khoralabs/vellum-client";

export type VellumFlowChainViewOptions = {
  /** When set, chain reads may consult channel-backed policy/state (future). */
  client?: VellumClient;
  channelId?: string;
  /** Seeds `offerId::portId` → string for {@link FlowChainView#existingStringValue}. */
  seedBinds?: ReadonlyMap<string, string>;
};

/**
 * {@link FlowChainView} for vellum: in-memory or channel-backed (stub until persistence is wired).
 */
export function createVellumFlowChainView(options: VellumFlowChainViewOptions = {}): FlowChainView {
  const inner = createInMemoryFlowChainView(options.seedBinds);
  const { client, channelId } = options;

  if (client === undefined && channelId === undefined) {
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
      void channelId;
      return undefined;
    },
  };
}
