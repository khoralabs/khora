import { hashPlainObject, schemaToHashInput } from "../hashing/hash.js";
import { evaluatePolicyWithHooks, mergeToolPipelineHooks } from "../policy/pipeline-hooks.js";
import type { PolicyResultMap, SharedPolicy, ToolPipelineHooks } from "../policy/types.js";
import type { StandardSchemaV1 } from "../standard-schema.js";
import type { Composable, ToolkitContext, ToolkitResult } from "../toolkit/types.js";
import type { ToolRuntimeContext, ToolSpec } from "./types.js";

export type ToolStaticProps<
  NAME extends string,
  INPUT,
  /** Session/runtime env shape required in {@link ToolRuntimeContext} when this tool is evaluated. */
  Env = unknown,
> = {
  kind: "tool";
  name: NAME;
  description: string | undefined;
  inputSchema: StandardSchemaV1<INPUT>;
  policies: SharedPolicy[];
  instructions: string[] | undefined;
  /** Not set at runtime; carries {@link Env} for {@link ExtractToolStaticEnv}. */
  readonly __expectedEnv?: Env;
};

/** Extract {@code Env} from a leaf tool’s {@link ToolStaticProps} (defaults to {@code unknown}). */
export type ExtractToolStaticEnv<SP> =
  SP extends ToolStaticProps<string, infer _I, infer Env> ? Env : unknown;

function monotonicNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function tool<
  const NAME extends string,
  INPUT,
  OUTPUT,
  /** Pass explicitly (e.g. `tool<..., MyEnv>(...)`) so `handler`’s `ctx.env` is checked against your session env. */
  Env = unknown,
>(args: {
  name: NAME;
  description?: string;
  inputSchema: StandardSchemaV1<INPUT>;
  instructions?: string[];
  policies?: SharedPolicy[];
  /** Per-tool pipeline hooks (merged with inherited toolkit + runtime context hooks). */
  hooks?: ToolPipelineHooks;
  handler: (
    ctx: ToolRuntimeContext<Env>,
    input: INPUT,
    options?: unknown,
  ) => Promise<OUTPUT> | AsyncIterable<OUTPUT>;
}): Composable<ToolStaticProps<NAME, INPUT, Env>, Record<NAME, ToolSpec>, Env> {
  const policies = args.policies ?? [];
  const staticProps: ToolStaticProps<NAME, INPUT, Env> = {
    kind: "tool",
    name: args.name,
    description: args.description,
    inputSchema: args.inputSchema,
    policies,
    instructions: args.instructions,
  };

  const policyIds = [...policies.map((p) => p.id)].sort((a, b) => a.localeCompare(b));
  const policiesSorted =
    policies.length > 0 ? [...policies].sort((a, b) => a.id.localeCompare(b.id)) : undefined;

  async function computeStaticHash(): Promise<string> {
    return hashPlainObject({
      kind: "tool",
      name: args.name,
      description: args.description ?? null,
      schema: schemaToHashInput(args.inputSchema),
      instructions: [...(args.instructions ?? [])].sort((a, b) => a.localeCompare(b)),
      policies: policyIds,
    });
  }

  async function evaluate(
    ctx: ToolkitContext<Env>,
    resolvedPolicies?: PolicyResultMap,
  ): Promise<ToolkitResult<Record<NAME, ToolSpec>>> {
    const resolved = resolvedPolicies ?? new Map<SharedPolicy, boolean>();
    const hooks = mergeToolPipelineHooks(ctx.inheritedPipelineHooks, args.hooks, ctx.pipelineHooks);

    for (const policy of policies) {
      let ok: boolean;
      if (resolved.has(policy)) {
        ok = resolved.get(policy) ?? false;
      } else {
        ok = await evaluatePolicyWithHooks(policy, ctx, resolved, hooks, {
          phase: "tool",
          toolName: args.name,
        });
      }
      if (!ok) {
        return {
          tools: {} as Record<NAME, ToolSpec>,
          instructions: "",
        };
      }
    }

    const toolCtx: ToolRuntimeContext<Env> = {
      env: ctx.env,
      namespace: ctx.namespace,
      agentId: ctx.agentId,
      agentName: ctx.agentName,
    };

    const spec: ToolSpec = {
      name: args.name,
      description: args.description,
      inputSchema: args.inputSchema,
      instructions: (args.instructions ?? []).join("\n\n"),
      policyIds,
      policies: policiesSorted,
      /** Prefer runtime {@code ctx} when the caller passes one (e.g. action env); else use env from {@code evaluate}. */
      handler: (runtimeCtx, inputUnknown, options) => {
        const rt = (runtimeCtx != null ? runtimeCtx : toolCtx) as ToolRuntimeContext<Env>;
        const start = monotonicNowMs();
        return (async () => {
          try {
            const out = await args.handler(rt, inputUnknown as INPUT, options);
            const durationMs = monotonicNowMs() - start;
            await hooks?.onToolExecuted?.({
              ok: true,
              toolName: args.name,
              input: inputUnknown,
              output: out,
              durationMs,
              env: ctx.env,
            });
            return out;
          } catch (err) {
            const durationMs = monotonicNowMs() - start;
            await hooks?.onToolExecuted?.({
              ok: false,
              toolName: args.name,
              input: inputUnknown,
              error: err instanceof Error ? err.message : String(err),
              durationMs,
              env: ctx.env,
            });
            throw err;
          }
        })();
      },
    };

    return {
      tools: { [args.name]: spec } as Record<NAME, ToolSpec>,
      instructions: spec.instructions,
    };
  }

  return { staticProps, policies, evaluate, computeStaticHash };
}
