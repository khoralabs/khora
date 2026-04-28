import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import { embedTextChunks } from "@cfd/memories-tools";
import type { createMatchmakingMemoriesBundle } from "../../memories/create-memories-bundle.ts";

const TRANSCRIPT_EXCERPT_LEN = 1200;

function excerptTranscript(transcript: string): string {
  const t = transcript.trim();
  if (t.length <= TRANSCRIPT_EXCERPT_LEN) {
    return t;
  }
  return `${t.slice(0, TRANSCRIPT_EXCERPT_LEN)}…`;
}

/**
 * Hybrid search (text + embedding) for post-negotiation summary—same retrieval path as memory_search, without an LLM tool loop.
 */
export async function buildNegotiationSummaryMemoryContext(args: {
  client: ReturnType<typeof createMatchmakingMemoriesBundle>["client"];
  namespace: string;
  embeddingModel: EmbeddingModel;
  transcript: string;
  partySlug: string;
  counterpartySlug: string;
}): Promise<string> {
  const { client, namespace, embeddingModel } = args;
  const excerpt = excerptTranscript(args.transcript);
  const queries = [
    `${excerpt}\n\nSummarize: user goals, boundaries, and fit with ${args.counterpartySlug}.`,
    `Party ${args.partySlug} preferences and history relevant to intro negotiation with ${args.counterpartySlug}.`,
  ];

  const lines: string[] = [];
  const seenKeys = new Set<string>();

  for (const q of queries) {
    const text = q.trim();
    if (text.length === 0) {
      continue;
    }
    const embeddings = await embedTextChunks(embeddingModel, [text]);
    const vector = embeddings[0];
    const content = vector !== undefined && vector.length > 0 ? { text, vector } : { text };
    const hits = client.search({
      namespace,
      content,
      options: { topK: 5, neighbors: "off" },
    });
    for (const h of hits) {
      const key = h.memory.key;
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      const labelStr = h.labels.map((l) => l.kind).join(", ");
      lines.push(
        `- **${key}** (${h.source_key}, score ${h.score.toFixed(3)}): labels [${labelStr}]`,
      );
    }
  }

  if (lines.length === 0) {
    return "(No memory hits in this namespace for summary queries; rely on the transcript.)";
  }
  return ["Retrieved memories (evidence for summary; do not invent facts beyond these and the transcript):", ...lines].join(
    "\n",
  );
}
