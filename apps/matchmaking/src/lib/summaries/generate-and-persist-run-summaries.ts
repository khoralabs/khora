import { createAgentRegistry } from "@cfd/agent-identity";
import { NegotiationSummaryClient } from "../agents/negotiation-summary/index.ts";
import { getMatchmakingDomainRuntime } from "../domain/runtime/index.ts";
import { getNegotiationModel } from "../matchmaking-obp/index.ts";
import { createMatchmakingMemoriesBundle } from "../memories/create-memories-bundle.ts";
import { getMatchmakingEmbeddingModel } from "../memories/matchmaking-embedding.ts";
import { resolveMemoriesDbPath, resolveMemoriesRoot } from "../memories/persisted-memories.ts";
import { getRunMatchmakingContext, readThreadJsonl } from "../negotiation-run-registry.ts";

function transcriptFromThreadJsonl(raw: string): string {
  const lines: string[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t.length === 0) continue;
    try {
      const parsed = JSON.parse(t) as Record<string, unknown>;
      if (parsed.kind === "string" && typeof parsed.string === "string") {
        const source = typeof parsed.source_key === "string" ? parsed.source_key : "line";
        lines.push(`[${source}] ${parsed.string}`);
      }
    } catch {
      continue;
    }
  }
  return lines.join("\n");
}

export async function generateAndPersistRunSummaries(args: { runId: string }): Promise<void> {
  const ctx = getRunMatchmakingContext(args.runId);
  if (ctx === undefined) {
    throw new Error("Run not found or missing matchmaking context");
  }
  const transcript = transcriptFromThreadJsonl(readThreadJsonl(args.runId));
  if (transcript.trim().length === 0) {
    throw new Error("Cannot summarize: negotiation transcript is empty");
  }

  const root = resolveMemoriesRoot();
  const bundle = createMatchmakingMemoriesBundle(resolveMemoriesDbPath(root), {
    memoriesRoot: root,
    domainLexicalStore: true,
  });
  const model = getNegotiationModel();
  const embeddingModel = getMatchmakingEmbeddingModel();
  const registry = createAgentRegistry();

  const pairs: Array<{
    partySlug: string;
    counterpartySlug: string;
    namespace: string;
  }> = [
    {
      partySlug: ctx.requesterSlug,
      counterpartySlug: ctx.requesteeSlug,
      namespace: ctx.partyMemoryNamespaces[0],
    },
    {
      partySlug: ctx.requesteeSlug,
      counterpartySlug: ctx.requesterSlug,
      namespace: ctx.partyMemoryNamespaces[1],
    },
  ];

  for (const pair of pairs) {
    const client = new NegotiationSummaryClient({
      registry,
      namespace: pair.namespace,
      model,
      client: bundle.client,
      embeddingModel,
      identityContext: {
        app: "matchmaking",
        role: "post-negotiation-summary",
        partySlug: pair.partySlug,
        counterpartySlug: pair.counterpartySlug,
      },
    });
    const output = await client.summarize({
      transcript,
      partySlug: pair.partySlug,
      counterpartySlug: pair.counterpartySlug,
    });
    getMatchmakingDomainRuntime().persistence.upsertRunSummary({
      runId: args.runId,
      partySlug: pair.partySlug,
      counterpartySlug: pair.counterpartySlug,
      summaryText: output.summaryText,
      ...(output.fitAssessment !== undefined ? { fitAssessment: output.fitAssessment } : {}),
      keyEvidence: output.keyEvidence,
      ...(output.recommendedNextStep !== undefined
        ? { recommendedNextStep: output.recommendedNextStep }
        : {}),
    });
  }
}
