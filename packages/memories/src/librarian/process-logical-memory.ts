import { evaluateComposable, type ToolRuntimeContext } from "@cfd/agent-identity";
import type { GenerateTextResult, ModelMessage, ToolSet } from "ai";
import { generateText, Output, stepCountIs } from "ai";
import type z from "zod";
import type { EmbeddingModel } from "../adapters/embedding-model";
import type { ResolvedSource } from "../adapters/resolve-sourcemap";
import { resolveSourcemap } from "../adapters/resolve-sourcemap";
import type { MemoriesClient, TypedSearchHit } from "../api/client";
import type { SearchHit } from "../api/search";
import { type LibrarianMergePlanWire, zLibrarianMergePlanWire } from "./librarian-plan";
import { buildLibrarianBaseSystemContent } from "./librarian-system-prompt";
import { type MemoryLibrarianEnv, memoryLibrarianToolkit } from "./librarian-toolkit";
import {
  decomposeLogicalMemoryToContent,
  type LogicalMemoryInput,
  type ProcessedLogicalMemory,
} from "./logical-memory";
import { mergeLogicalMemoryWithPlan, prefetchRelatedMemories } from "./organize";
import { toolMapToAiTools } from "./tool-spec-to-ai-sdk";

/** AI SDK result from the librarian `generateText` call (tools + structured plan). */
export type LibrarianPipelineGeneration = GenerateTextResult<ToolSet, never>;

export interface ProcessLogicalMemoryWithLibrarianParams<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> {
  /** AI SDK language model (caller-supplied provider). */
  model: Parameters<typeof generateText>[0]["model"];
  client: MemoriesClient<TNode, TEdge>;
  /** Same model used for ingestion / `memory_search` vector arm. */
  embeddingModel: EmbeddingModel;
  logicalMemory: LogicalMemoryInput;
  /** Resolves each prefetched hit’s {@link SourceMap} to readable source material. */
  store: import("../adapters/resolve-sourcemap").Store;
  /** Run per-chunk prefetch search before the model turn (default: true). */
  prefetch?: boolean;
  /** Max agent steps for tool calls + structured output (default: 12). */
  maxSteps?: number;
  /** When false, validate and return the plan without calling {@link mergeLogicalMemoryWithPlan}. */
  runMerge?: boolean;
  agentId?: string;
  agentName?: string;
}

export interface ProcessLogicalMemoryResult<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> {
  processedLogicalMemory: ProcessedLogicalMemory;
  prefetchedHits: TypedSearchHit<TNode, TEdge>[];
  resolvedSources: Array<{
    hit: TypedSearchHit<TNode, TEdge>;
    source: ResolvedSource;
  }>;
  plan: LibrarianMergePlanWire;
  /** Full AI SDK result (tool calls, usage, structured output). */
  generation: LibrarianPipelineGeneration;
}

function buildUserMessageContent(
  input: LogicalMemoryInput,
  contentItems: import("../api/merge-memory").MergeMemoryContentItem[],
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

/**
 * End-to-end librarian pipeline: decompose → optional prefetch + resolve sources → AI SDK (tools + structured plan) → merge.
 */
export async function processLogicalMemoryWithLibrarian<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(
  params: ProcessLogicalMemoryWithLibrarianParams<TNode, TEdge>,
): Promise<ProcessLogicalMemoryResult<TNode, TEdge>> {
  const {
    model,
    client,
    embeddingModel,
    logicalMemory,
    store,
    prefetch = true,
    maxSteps = 12,
    runMerge = true,
    agentId,
    agentName,
  } = params;

  const content = await decomposeLogicalMemoryToContent(logicalMemory);
  const processedLogicalMemory: ProcessedLogicalMemory = { ...logicalMemory, content };

  const prefetchedHits = prefetch
    ? prefetchRelatedMemories(client, logicalMemory.namespace, content)
    : [];

  const resolvedSources: ProcessLogicalMemoryResult<TNode, TEdge>["resolvedSources"] = [];
  for (const hit of prefetchedHits) {
    const source = await resolveSourcemap(hit, store);
    resolvedSources.push({ hit, source });
  }

  const evaluated = await evaluateComposable(memoryLibrarianToolkit, {
    env: {
      client,
      namespace: logicalMemory.namespace,
      embeddingModel,
    } as unknown as MemoryLibrarianEnv,
    namespace: logicalMemory.namespace,
    agentId,
    agentName,
  });

  const runtime: ToolRuntimeContext<MemoryLibrarianEnv> = {
    env: {
      client,
      namespace: logicalMemory.namespace,
      embeddingModel,
    } as unknown as MemoryLibrarianEnv,
    namespace: logicalMemory.namespace,
    agentId,
    agentName,
  };

  const aiTools = toolMapToAiTools(evaluated.tools, runtime);

  const baseSystem = buildLibrarianBaseSystemContent(client.ontology);

  const allowedKeys = [...new Set(prefetchedHits.map((h) => h.memory.key))];
  const keysSection =
    allowedKeys.length > 0
      ? `## Candidate memory keys from prefetch (edges must use existing keys)\n${allowedKeys.map((k) => `- \`${k}\``).join("\n")}\n\nYou may also discover keys via **memory_search**.`
      : "No prefetch hits; use **memory_search** to find existing memories before choosing edge targets.";

  const toolkitSection = evaluated.instructions.trim()
    ? `## Toolkit instructions\n${evaluated.instructions}`
    : "";

  const resolvedSections = await Promise.all(
    resolvedSources.map(({ hit, source }) => formatResolvedSourceBlock(hit, source)),
  );

  const messages: ModelMessage[] = [
    { role: "system", content: baseSystem },
    { role: "system", content: keysSection },
    ...(toolkitSection ? [{ role: "system" as const, content: toolkitSection }] : []),
    ...resolvedSections.map((c) => ({
      role: "system" as const,
      content: `## Resolved source\n${c}`,
    })),
    {
      role: "user",
      content: buildUserMessageContent(logicalMemory, content),
    },
  ];

  const generation = (await generateText({
    model,
    tools: aiTools,
    stopWhen: stepCountIs(maxSteps),
    messages,
    output: Output.object({
      name: "LibrarianMergePlan",
      description:
        "Labels and edges for the target logical memory. Edge memory_key values must refer to existing memories in this namespace (prefetch list or memory_search results).",
      schema: zLibrarianMergePlanWire,
    }),
  })) as LibrarianPipelineGeneration;

  const plan = zLibrarianMergePlanWire.parse(generation.output);

  if (runMerge) {
    await mergeLogicalMemoryWithPlan(client, processedLogicalMemory, plan);
  }

  return {
    processedLogicalMemory,
    prefetchedHits,
    resolvedSources,
    plan,
    generation,
  };
}
