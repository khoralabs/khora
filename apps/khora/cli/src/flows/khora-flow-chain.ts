import { createInMemoryFlowChainView } from "@khoralabs/cli-flow-nbc";

export function createKhoraFlowChainView(
  seedBinds?: ReadonlyMap<string, string>,
): ReturnType<typeof createInMemoryFlowChainView> {
  return createInMemoryFlowChainView(seedBinds);
}
