import { createInMemoryFlowChainView } from "@khoralabs/cli-flow";

export function createKhoraFlowChainView(
  seedBinds?: ReadonlyMap<string, string>,
): ReturnType<typeof createInMemoryFlowChainView> {
  return createInMemoryFlowChainView(seedBinds);
}
