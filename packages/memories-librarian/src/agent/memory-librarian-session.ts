/**
 * Memory librarian **session runtime**: the {@link SessionRunner} (orchestration) and **session hooks**
 * that wire `ToolkitContext` / `ToolRuntimeContext` after `SessionContext` is merged (`onAfterContext`).
 *
 * **Toolkit pipeline hooks** (`onPolicyEvaluated` / `onToolExecuted` on tools/toolkits or
 * `ToolkitContext.pipelineHooks`) are a separate layer inside composable evaluation; they are not
 * defined here. For identity + default `register` options, use `declareMemoryLibrarianAgent` in `./declaration.ts`.
 */
import {
  evaluateRegisteredAgentAffordances,
  type HydrateAffordancesBindTool,
  hydrateAffordances,
  type RegisterAgentOptions,
  type RegisteredAgentAffordancesWire,
  type SessionRunner,
  type ToolkitContext,
  type ToolRuntimeContext,
} from "@cfd/agent-identity";
import type {
  MemoriesClient,
  MemoriesClientAsync,
  ResolvedSource,
  TypedSearchHit,
} from "@cfd/memories-core";
import type { LanguageModel } from "ai";
import { NoOutputGeneratedError } from "ai";
import type z from "zod";
import type { EmbeddingModel } from "../adapters";
import { logger } from "../telemetry/logger.js";
import { librarianLog } from "../telemetry/payloads.js";
import { elapsedMs } from "../timing.js";
import type { LogicalMemoryInput, ProcessedLogicalMemory } from "../workflow/logical-memory";
import { mergeLogicalMemoryWithPlan } from "../workflow/organize";
import { type LibrarianMergePlanWire, parseLibrarianMergePlanWire } from "../workflow/plan";
import {
  createMemoryLibrarianToolLoopAgent,
  type LibrarianPipelineGeneration,
} from "./create-agent";
import {
  buildMemoryLibrarianToolkitContext,
  buildMemoryLibrarianToolRuntimeContext,
} from "./librarian-context";
import { buildMemoryLibrarianModelMessages } from "./memory-librarian-messages.js";
import { createMemoryLibrarianSessionAuditHooks } from "./session-audit-hooks.js";
import type { MemoryLibrarianEnv } from "./toolkit";

export type MemoryLibrarianAffordancesHydration = {
  wire: RegisteredAgentAffordancesWire;
  bindTool: HydrateAffordancesBindTool;
};

export type MemoryLibrarianSessionContext<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = {
  model: LanguageModel;
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  embeddingModel: EmbeddingModel;
  agentId?: string;
  agentName?: string;
  toolkitCtx?: ToolkitContext<MemoryLibrarianEnv>;
  runtime?: ToolRuntimeContext<MemoryLibrarianEnv>;
  /**
   * When set, the session uses {@link hydrateAffordances} instead of {@link evaluateRegisteredAgentAffordances}
   * (e.g. restored snapshot). Requires {@link toolkitCtx} only if something else reads it; hydration does not
   * re-walk the composable tree.
   */
  affordancesHydration?: MemoryLibrarianAffordancesHydration;
};

export type MemoryLibrarianSessionInput<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = {
  logicalMemory: LogicalMemoryInput;
  processedLogicalMemory: ProcessedLogicalMemory;
  prefetchedHits: TypedSearchHit<TNode, TEdge>[];
  resolvedSources: Array<{
    hit: TypedSearchHit<TNode, TEdge>;
    source: ResolvedSource;
  }>;
  runMerge: boolean;
  maxSteps: number;
};

export type MemoryLibrarianSessionOutput = {
  generation: LibrarianPipelineGeneration;
  plan: LibrarianMergePlanWire;
};

/** Product orchestration: evaluate affordances, run the tool-loop agent, parse plan, optional merge. */
export function createMemoryLibrarianSessionRunner<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(): SessionRunner<
  MemoryLibrarianSessionInput<TNode, TEdge>,
  MemoryLibrarianSessionOutput,
  MemoryLibrarianSessionContext<TNode, TEdge>
> {
  return async ({ agent, input, context }) => {
    const { model, client, embeddingModel, toolkitCtx, runtime, affordancesHydration } = context;
    const {
      logicalMemory,
      processedLogicalMemory,
      prefetchedHits,
      resolvedSources,
      runMerge,
      maxSteps,
    } = input;
    if (!toolkitCtx || !runtime) {
      throw new Error("memory librarian session context missing toolkit/runtime");
    }
    const tAff = performance.now();
    const affordances = affordancesHydration
      ? await hydrateAffordances(affordancesHydration)
      : await evaluateRegisteredAgentAffordances(agent, toolkitCtx);
    logger.info(
      librarianLog(
        affordancesHydration
          ? "librarian.runner.hydrateAffordances"
          : "librarian.runner.evaluateAffordances",
        {
          processTimeMs: elapsedMs(tAff),
          toolCount: Object.keys(affordances.tools).length,
        },
      ),
    );

    const librarian = createMemoryLibrarianToolLoopAgent({
      model,
      identity: agent,
      affordances,
      runtime,
      maxSteps,
      ontology: client.ontology,
    });

    const messages = await buildMemoryLibrarianModelMessages({
      logicalMemory,
      processedLogicalMemory,
      prefetchedHits,
      resolvedSources,
    });

    const tGen = performance.now();
    const generation = await librarian.generate({
      messages,
    });
    logger.info(
      librarianLog("librarian.runner.toolLoopGenerate", {
        processTimeMs: elapsedMs(tGen),
        stepCount: generation.steps.length,
        finishReason: generation.finishReason,
      }),
    );
    let plan: LibrarianMergePlanWire;
    try {
      plan = parseLibrarianMergePlanWire(client.ontology, generation.output);
    } catch (err) {
      if (NoOutputGeneratedError.isInstance(err)) {
        throw new Error(
          `Memory librarian did not produce structured merge output (steps=${generation.steps.length}, finishReason=${JSON.stringify(generation.finishReason)}). Increase maxSteps — tool calls consume steps before the final JSON plan.`,
          { cause: err },
        );
      }
      throw err;
    }
    if (runMerge) {
      const tMerge = performance.now();
      await mergeLogicalMemoryWithPlan(client, processedLogicalMemory, plan, embeddingModel);
      logger.info(
        librarianLog("librarian.runner.mergeMemory", {
          processTimeMs: elapsedMs(tMerge),
        }),
      );
    }
    return { generation, plan };
  };
}

/**
 * Default registration options: `run` from {@link createMemoryLibrarianSessionRunner} and session
 * `onAfterContext` to build `ToolkitContext` / `ToolRuntimeContext` from merged session context.
 */
export function memoryLibrarianRegistryRegistration<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(): RegisterAgentOptions<
  MemoryLibrarianSessionInput<TNode, TEdge>,
  MemoryLibrarianSessionOutput,
  MemoryLibrarianSessionContext<TNode, TEdge>
> {
  const auditHooks = createMemoryLibrarianSessionAuditHooks<TNode, TEdge>();

  return {
    run: createMemoryLibrarianSessionRunner<TNode, TEdge>(),
    hooks: {
      onStart: auditHooks.onStart,
      onAfterIdentity: auditHooks.onAfterIdentity,
      onBeforeRun: auditHooks.onBeforeRun,
      onAfterRun: auditHooks.onAfterRun,
      onError: auditHooks.onError,
      async onAfterContext(args) {
        const { input, context: ctx } = args;
        ctx.toolkitCtx = buildMemoryLibrarianToolkitContext({
          client: ctx.client,
          namespace: input.logicalMemory.namespace,
          embeddingModel: ctx.embeddingModel,
          agentId: ctx.agentId,
          agentName: ctx.agentName,
        });
        ctx.runtime = buildMemoryLibrarianToolRuntimeContext({
          client: ctx.client,
          namespace: input.logicalMemory.namespace,
          embeddingModel: ctx.embeddingModel,
          agentId: ctx.agentId,
          agentName: ctx.agentName,
        });
        await auditHooks.onAfterContext?.(args);
      },
    },
  };
}
