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
  type RegisteredAgentIdentity,
  type SessionRunner,
  type ToolkitContext,
  type ToolRuntimeContext,
} from "@cfd/agent-identity";
import type {
  MemoriesClient,
  MergeMemoryContentItem,
  ResolvedSource,
  SearchHit,
  TypedSearchHit,
} from "@cfd/memories";
import type { LanguageModel, ModelMessage } from "ai";
import { NoOutputGeneratedError } from "ai";
import type z from "zod";
import type { EmbeddingModel } from "../adapters";
import { logger } from "../logger.js";
import { elapsedMs } from "../timing.js";
import type { LogicalMemoryInput, ProcessedLogicalMemory } from "../workflow/logical-memory";
import { mergeLogicalMemoryWithPlan } from "../workflow/organize";
import { type LibrarianMergePlanWire, parseLibrarianMergePlanWire } from "../workflow/plan";
import {
  createMemoryLibrarianToolLoopAgent,
  type LibrarianPipelineGeneration,
} from "./create-agent";
import {
  buildLibrarianPrefetchKeysInstruction,
  wrapResolvedSourceInstruction,
} from "./instructions";
import {
  buildMemoryLibrarianToolkitContext,
  buildMemoryLibrarianToolRuntimeContext,
} from "./librarian-context";
import type { MemoryLibrarianEnv } from "./toolkit";

export type MemoryLibrarianSessionContext<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = {
  model: LanguageModel;
  client: MemoriesClient<TNode, TEdge>;
  embeddingModel: EmbeddingModel;
  agentId?: string;
  agentName?: string;
  toolkitCtx?: ToolkitContext<MemoryLibrarianEnv>;
  runtime?: ToolRuntimeContext<MemoryLibrarianEnv>;
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

function buildUserMessageContent(
  input: LogicalMemoryInput,
  contentItems: MergeMemoryContentItem[],
): string {
  const lines: string[] = [];
  lines.push(`Target memory key: ${input.key}`);
  lines.push(`Namespace: ${input.namespace}`);
  lines.push("");
  lines.push("## Logical memory (what the user supplied)");
  if (input.plaintext?.trim()) {
    lines.push("### Plaintext");
    lines.push(input.plaintext.trim());
    lines.push("");
  }
  if (input.files?.length) {
    for (let i = 0; i < input.files.length; i++) {
      const f = input.files[i];
      if (!f) continue;
      lines.push(`### File ${i}: ${f.fileName ?? "unnamed"}`);
      lines.push(`MIME: ${f.mimeType ?? "(unknown)"}`);
      if (f.title) lines.push(`Title: ${f.title}`);
      if (f.fallbackText) lines.push(`Fallback / excerpt: ${f.fallbackText}`);
      lines.push(
        "(Binary or long content is embedded into merge chunks; use tools and context below as needed.)",
      );
      lines.push("");
    }
  }
  lines.push("## Merge chunk keys (from decomposition)");
  for (const item of contentItems) {
    lines.push(`- ${item.key}`);
  }
  return lines.join("\n");
}

async function formatResolvedSourceBlock(hit: SearchHit, source: ResolvedSource): Promise<string> {
  const header = [
    `Prefetched candidate: namespace=${hit.memory.namespace}`,
    `memory.key=${hit.memory.key}`,
    `source_key=${hit.source_key}`,
    `score=${String(hit.score)}`,
    hit.labels.length ? `node_labels=${hit.labels.join(",")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  if (source.kind === "string") {
    return `${header}\n\n---\n${source.string}`;
  }
  if (source.kind === "url") {
    return `${header}\n\nURL: ${source.url}`;
  }
  const mime = source.blob.type || "application/octet-stream";
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
    const t = await source.blob.text();
    return `${header}\n\n---\n(${mime})\n${t}`;
  }
  return `${header}\n\n(binary blob: ${mime}, ${String(source.blob.size)} bytes — link using keys from this block or memory_search.)`;
}

/** Product orchestration: evaluate affordances, run the tool-loop agent, parse plan, optional merge. */
export function createMemoryLibrarianSessionRunner<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(): SessionRunner<MemoryLibrarianSessionInput<TNode, TEdge>, MemoryLibrarianSessionOutput> {
  return async ({ agent, input, context }) => {
    const { model, client, embeddingModel } = context as MemoryLibrarianSessionContext<TNode, TEdge>;
    const {
      logicalMemory,
      processedLogicalMemory,
      prefetchedHits,
      resolvedSources,
      runMerge,
      maxSteps,
    } = input;

    const { toolkitCtx, runtime } = context as MemoryLibrarianSessionContext<TNode, TEdge>;
    if (!toolkitCtx || !runtime) {
      throw new Error("memory librarian session context missing toolkit/runtime");
    }
    const tAff = performance.now();
    const affordances = await evaluateRegisteredAgentAffordances(agent, toolkitCtx);
    logger.info({
      phase: "librarian.evaluateAffordances",
      durationMs: elapsedMs(tAff),
      toolCount: Object.keys(affordances.tools).length,
    });

    const librarian = createMemoryLibrarianToolLoopAgent({
      model,
      identity: agent,
      affordances,
      runtime,
      maxSteps,
      ontology: client.ontology,
    });

    const allowedKeys = [...new Set(prefetchedHits.map((h) => h.memory.key))];
    const keysSection = buildLibrarianPrefetchKeysInstruction(allowedKeys);
    const resolvedSections = await Promise.all(
      resolvedSources.map(({ hit, source }) => formatResolvedSourceBlock(hit, source)),
    );
    const messages: ModelMessage[] = [
      { role: "system", content: keysSection },
      ...resolvedSections.map((c) => ({
        role: "system" as const,
        content: wrapResolvedSourceInstruction(c),
      })),
      {
        role: "user",
        content: buildUserMessageContent(logicalMemory, processedLogicalMemory.content),
      },
    ];

    const tGen = performance.now();
    const generation = await librarian.generate({
      messages,
    });
    logger.info({
      phase: "librarian.toolLoopGenerate",
      durationMs: elapsedMs(tGen),
      stepCount: generation.steps.length,
      finishReason: generation.finishReason,
    });
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
      logger.info({
        phase: "librarian.mergeMemory",
        durationMs: elapsedMs(tMerge),
      });
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
>(): {
  run: SessionRunner;
  hooks: {
    onAfterContext: (args: {
      agent: RegisteredAgentIdentity;
      input: unknown;
      context: Record<string, unknown>;
    }) => void;
  };
} {
  return {
    run: createMemoryLibrarianSessionRunner<TNode, TEdge>() as SessionRunner,
    hooks: {
      onAfterContext(args) {
        const input = args.input as MemoryLibrarianSessionInput<TNode, TEdge>;
        const ctx = args.context as MemoryLibrarianSessionContext<TNode, TEdge>;
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
      },
    },
  };
}
