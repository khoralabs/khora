import type { RegisteredAgentAffordances } from "../agent/evaluate-registered-agent-affordances.js";
import type { PolicyResultMap, SharedPolicy } from "../policy/types.js";
import type { ToolSpec } from "../tool/types.js";
import { hashToolSpecWire, toolSpecToWire } from "./tool-spec-wire.js";
import type {
  PolicyEvaluationSnapshot,
  PolicySnapshotMode,
  RegisteredAgentAffordancesWire,
} from "./types.js";

/**
 * Strips handlers from evaluated affordances; safe for JSON and Smithy `Document`.
 */
export function affordancesToWire(
  affordances: RegisteredAgentAffordances,
): RegisteredAgentAffordancesWire {
  const tools: Record<string, ReturnType<typeof toolSpecToWire>> = {};
  for (const [name, spec] of Object.entries(affordances.tools)) {
    tools[name] = toolSpecToWire(spec);
  }
  return {
    instructions: affordances.instructions,
    tools,
  };
}

/**
 * Freezes {@link PolicyResultMap} into a JSON-safe record keyed by {@link SharedPolicy.id}.
 * Sorts keys lexicographically for stable serialization.
 */
export function capturePolicyResults(
  map: PolicyResultMap,
  mode: PolicySnapshotMode,
  options?: {
    capturedAt?: number;
    policyBundleId?: string;
    policyEngineVersion?: string;
  },
): PolicyEvaluationSnapshot {
  const results: Record<string, boolean> = {};
  for (const [policy, ok] of map) {
    results[policy.id] = ok;
  }
  const sortedKeys = Object.keys(results).sort((a, b) => a.localeCompare(b));
  const sortedResults: Record<string, boolean> = {};
  for (const k of sortedKeys) {
    const v = results[k];
    if (v === undefined) {
      throw new Error(`capturePolicyResults: missing key ${k}`);
    }
    sortedResults[k] = v;
  }
  return {
    mode,
    results: sortedResults,
    ...options,
  };
}

/**
 * Rebuilds live {@link RegisteredAgentAffordances} by attaching handlers via `bindTool`.
 *
 * `bindTool` receives the wire tool, plus {@link hashToolSpecWire} for registry lookups
 * (e.g. match `toolName` + `toolHash` to an implementation).
 */
export type HydrateAffordancesBindTool = (args: {
  wire: RegisteredAgentAffordancesWire["tools"][string];
  toolHash: string;
}) => ToolSpec | Promise<ToolSpec>;

export async function hydrateAffordances(args: {
  wire: RegisteredAgentAffordancesWire;
  bindTool: HydrateAffordancesBindTool;
}): Promise<RegisteredAgentAffordances> {
  const tools: Record<string, ToolSpec> = {};
  for (const [name, w] of Object.entries(args.wire.tools)) {
    const toolHash = await hashToolSpecWire(w);
    const spec = await args.bindTool({ wire: w, toolHash });
    if (spec.name !== name) {
      throw new Error(
        `hydrateAffordances: bindTool returned ToolSpec with name ${JSON.stringify(spec.name)}, expected ${JSON.stringify(name)}`,
      );
    }
    tools[name] = spec;
  }
  return {
    tools,
    instructions: args.wire.instructions,
  };
}
