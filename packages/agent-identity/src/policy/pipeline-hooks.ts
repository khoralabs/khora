import type { ToolkitContext } from "../toolkit/types.js";
import type {
  PolicyEvaluatedPayload,
  PolicyResultMap,
  SharedPolicy,
  ToolPipelineHooks,
} from "./types.js";

/**
 * Composes hook layers in order: first layer runs first, then second, etc.
 * Typical order: toolkit → tool → {@link ToolkitContext.pipelineHooks} (runtime).
 */
export function mergeToolPipelineHooks(
  ...layers: (ToolPipelineHooks | undefined)[]
): ToolPipelineHooks | undefined {
  const onPolicyEvaluated = layers.flatMap((l) =>
    l?.onPolicyEvaluated ? [l.onPolicyEvaluated] : [],
  );
  const onToolExecuted = layers.flatMap((l) => (l?.onToolExecuted ? [l.onToolExecuted] : []));
  if (onPolicyEvaluated.length === 0 && onToolExecuted.length === 0) {
    return undefined;
  }
  return {
    onPolicyEvaluated:
      onPolicyEvaluated.length === 0
        ? undefined
        : async (e) => {
            for (const fn of onPolicyEvaluated) await fn(e);
          },
    onToolExecuted:
      onToolExecuted.length === 0
        ? undefined
        : async (e) => {
            for (const fn of onToolExecuted) await fn(e);
          },
  };
}

/**
 * Evaluates one policy, updates {@link PolicyResultMap}, emits hooks.
 * Returns whether this policy passed.
 */
export async function evaluatePolicyWithHooks<Env>(
  policy: SharedPolicy,
  ctx: ToolkitContext<Env>,
  resolved: PolicyResultMap,
  hooks: ToolPipelineHooks | undefined,
  meta: Pick<PolicyEvaluatedPayload, "phase" | "toolName" | "composableName">,
): Promise<boolean> {
  let ok = false;
  let error: string | undefined;
  try {
    ok = resolved.get(policy) ?? (await policy.evaluate(ctx.env));
    resolved.set(policy, ok);
    if (!ok) error = `Policy denied: ${policy.id}`;
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
    resolved.set(policy, false);
  }
  await hooks?.onPolicyEvaluated?.({
    ok,
    policyId: policy.id,
    error,
    env: ctx.env,
    ...meta,
  });
  return ok;
}
