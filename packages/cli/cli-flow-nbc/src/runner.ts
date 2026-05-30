import type { ReadLineFn } from "@khoralabs/cli-kit";
import type { JsonDocument } from "@khoralabs/obp-v2-model";

import type { FlowChainView } from "./chain-view";
import type { FlowDefinition, FlowPort } from "./flow-types";

function bindKey(offerId: string, portId: string): string {
  return `${offerId}::${portId}`;
}

export type ValidateBindInput = {
  offerId: string;
  port: FlowPort;
  policy: JsonDocument | null;
  value: string;
};

export type RunFlowOptions = {
  readLine: ReadLineFn;
  chain: FlowChainView;
  validateBind?: (input: ValidateBindInput) => void | Promise<void>;
  /** Keys `offerId::portId` — pre-filled before prompts (e.g. partial CLI flags). */
  seedStringValues?: ReadonlyMap<string, string>;
};

export type FlowRunResult = {
  valuesByOffer: Record<string, Record<string, string | undefined>>;
};

export async function defaultValidateBind(input: ValidateBindInput): Promise<void> {
  const t = input.value.trim();
  if (input.port.optional === true && t.length === 0) return;
  if (t.length === 0) {
    throw new Error(`${input.port.id} is required`);
  }
  const pol = input.policy;
  if (pol !== null && pol !== undefined) {
    const empty =
      typeof pol === "object" && !Array.isArray(pol) && Object.keys(pol as object).length === 0;
    if (!empty) {
      throw new Error(
        `Port ${input.port.id} has bind_policy; provide a validateBind hook to enforce it`,
      );
    }
  }
}

async function applyValidator(
  validator: (input: ValidateBindInput) => void | Promise<void>,
  offerId: string,
  port: FlowPort,
  policy: JsonDocument | null,
  raw: string,
): Promise<void> {
  await validator({ offerId, port, policy, value: raw });
}

function resolvedValueAfterValid(port: FlowPort, raw: string): string | undefined {
  const t = raw.trim();
  if (port.optional === true && t.length === 0) return undefined;
  return t;
}

/**
 * Run a declarative NBC-shaped flow: for each port, consult chain + seeds, then readline until validation passes.
 */
export async function runFlow(
  def: FlowDefinition,
  options: RunFlowOptions,
): Promise<FlowRunResult> {
  const { readLine, chain, seedStringValues } = options;
  const validator = options.validateBind ?? defaultValidateBind;
  const valuesByOffer: Record<string, Record<string, string | undefined>> = {};

  for (const offer of def.offers) {
    const offerValues: Record<string, string | undefined> = {};
    valuesByOffer[offer.id] = offerValues;
    for (const port of offer.ports) {
      const policy = chain.resolveBindPolicy(offer.id, port);
      const key = bindKey(offer.id, port.id);
      let candidate = seedStringValues?.get(key) ?? chain.existingStringValue(offer.id, port.id);

      let settled = false;
      let resolved: string | undefined;

      if (candidate !== undefined) {
        try {
          await applyValidator(validator, offer.id, port, policy, candidate);
          resolved = resolvedValueAfterValid(port, candidate);
          settled = true;
        } catch {
          candidate = undefined;
        }
      }

      while (!settled) {
        const line = await readLine(port.prompt);
        try {
          await applyValidator(validator, offer.id, port, policy, line);
          resolved = resolvedValueAfterValid(port, line);
          settled = true;
        } catch {
          /* re-prompt */
        }
      }

      offerValues[port.id] = resolved;
    }
  }

  return { valuesByOffer };
}
