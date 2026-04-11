import type {
  MergeMemoryContentItem,
  ResolvedSource,
  SearchHit,
  TypedSearchHit,
} from "@cfd/memories";
import type { ModelMessage } from "ai";
import type z from "zod";
import type { LogicalMemoryInput, ProcessedLogicalMemory } from "../workflow/logical-memory";
import {
  buildLibrarianPrefetchKeysInstruction,
  wrapResolvedSourceInstruction,
} from "./instructions";

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

/**
 * System + user messages for the memory librarian tool-loop (prefetch keys, resolved sources, user task).
 */
export async function buildMemoryLibrarianModelMessages<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(input: {
  logicalMemory: LogicalMemoryInput;
  processedLogicalMemory: ProcessedLogicalMemory;
  prefetchedHits: TypedSearchHit<TNode, TEdge>[];
  resolvedSources: Array<{
    hit: TypedSearchHit<TNode, TEdge>;
    source: ResolvedSource;
  }>;
}): Promise<ModelMessage[]> {
  const { logicalMemory, processedLogicalMemory, prefetchedHits, resolvedSources } = input;
  const allowedKeys = [...new Set(prefetchedHits.map((h) => h.memory.key))];
  const keysSection = buildLibrarianPrefetchKeysInstruction(allowedKeys);
  const resolvedSections = await Promise.all(
    resolvedSources.map(({ hit, source }) => formatResolvedSourceBlock(hit, source)),
  );
  return [
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
}
