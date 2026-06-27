import type { ReadLineFn } from "@khoralabs/cli-kit";

import type { FlowChainView } from "./chain-view";
import type { FlowDefinition } from "./flow-types";
import { createInMemoryFlowChainView } from "./in-memory-chain";
import { runFlow } from "./runner";
import { getOfferRow, seedMapFromOffer } from "./seed-helpers";

export type RunOfferFlowOptions = {
  readLine: ReadLineFn;
  def: FlowDefinition;
  offerId: string;
  partialSeeds?: Readonly<Record<string, string | undefined>>;
  /** Defaults to {@link createInMemoryFlowChainView} with no seeds. */
  chain?: FlowChainView;
};

/**
 * Run a {@link FlowDefinition} and return binds for a single offer (typical CLI wizard).
 */
export async function runOfferFlow(
  options: RunOfferFlowOptions,
): Promise<Record<string, string | undefined>> {
  const { readLine, def, offerId, partialSeeds, chain = createInMemoryFlowChainView() } = options;
  const seedStringValues = seedMapFromOffer(offerId, partialSeeds ?? {});
  const result = await runFlow(def, {
    readLine,
    chain,
    seedStringValues,
  });
  return getOfferRow(result, offerId);
}

/** Required string port after {@link runOfferFlow} (guard + clearer errors). */
export function requireFlowString(
  row: Record<string, string | undefined>,
  portId: string,
  message?: string,
): string {
  const v = row[portId]?.trim() ?? "";
  if (v.length === 0) {
    throw new Error(message ?? `${portId} is required`);
  }
  return v;
}
