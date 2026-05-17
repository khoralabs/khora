import type { FlowChainView } from "./chain-view.ts";
import type { FlowPort } from "./flow-types.ts";

function bindKey(offerId: string, portId: string): string {
  return `${offerId}::${portId}`;
}

/**
 * Non-persistent chain view: policy comes from the flow port spec; “existing” values from an optional seed map.
 */
export function createInMemoryFlowChainView(
  seedBinds?: ReadonlyMap<string, string>,
): FlowChainView {
  const seeds = seedBinds ?? new Map<string, string>();
  return {
    resolveBindPolicy(_offerId: string, port: FlowPort) {
      return port.bind_policy ?? null;
    },
    existingStringValue(offerId: string, portId: string) {
      return seeds.get(bindKey(offerId, portId));
    },
  };
}
