import type { LanguageModel } from "ai";
import { getMatchmakingDomainRuntime } from "./domain/runtime/index.ts";
import { getNegotiationModel } from "./matchmaking-obp/index.ts";
import { createMatchmakingMemoriesBundle } from "./memories/create-memories-bundle.ts";
import { getMatchmakingEmbeddingModel } from "./memories/matchmaking-embedding.ts";
import type { MeetingSeedPayload } from "./memories/meeting-seed-payload.ts";
import { mergeMeetingDomainPayloadIntoNamespace } from "./memories/merge-meeting-payload.ts";
import { resolveMemoriesDbPath, resolveMemoriesRoot } from "./memories/persisted-memories.ts";
import { getRunMatchmakingContext } from "./negotiation-run-registry.ts";

async function mergeToBothPartyNamespaces(
  runId: string,
  model: LanguageModel,
  makePayload: (namespace: string) => {
    payload: MeetingSeedPayload;
    memoryKey: string;
    correlationId: string;
  },
): Promise<void> {
  const ctx = getRunMatchmakingContext(runId);
  if (ctx === undefined) {
    throw new Error("Run not found or missing matchmaking context");
  }
  const root = resolveMemoriesRoot();
  const bundle = createMatchmakingMemoriesBundle(resolveMemoriesDbPath(root), {
    memoriesRoot: root,
    domainLexicalStore: true,
  });
  const embeddingModel = getMatchmakingEmbeddingModel();

  for (const namespace of ctx.partyMemoryNamespaces) {
    const { payload, memoryKey, correlationId } = makePayload(namespace);
    await mergeMeetingDomainPayloadIntoNamespace({
      bundle,
      chatModel: model,
      embeddingModel,
      namespace,
      memoryKey,
      domainPayload: payload,
      correlationId,
    });
  }
}

/**
 * One adapter→integrator pass per party namespace for the final post-negotiation review
 * (meeting + optional agent-critique in one memory).
 */
export async function mergePostNegotiationReviewToPartyKgs(args: {
  runId: string;
  decision: "accept" | "decline";
  agentFeedback?: string;
}): Promise<void> {
  const { runId, decision, agentFeedback } = args;
  const model = getNegotiationModel();
  const payload: MeetingSeedPayload = {
    kind: "meeting_post_negotiation_review",
    decision,
    ...(agentFeedback !== undefined && agentFeedback.length > 0 ? { agentFeedback } : {}),
  };
  await mergeToBothPartyNamespaces(runId, model, (namespace) => ({
    payload,
    memoryKey: `live/post-negotiation-review/${runId}`,
    correlationId: `post-negotiation-review-${namespace}-${runId}`,
  }));
  getMatchmakingDomainRuntime().persistence.recordReflection({
    runId,
    kind: "post_negotiation_review",
    decision,
    agentFeedback,
  });
}

/**
 * Post-meeting reflection text merged into both party namespaces.
 */
export async function mergePostMeetingReflectionToPartyKgs(args: {
  runId: string;
  text: string;
}): Promise<void> {
  const { runId, text } = args;
  const model = getNegotiationModel();
  const payload: MeetingSeedPayload = { kind: "meeting_reflection", text };
  await mergeToBothPartyNamespaces(runId, model, (namespace) => ({
    payload,
    memoryKey: `live/post-meeting-reflection/${runId}`,
    correlationId: `post-meeting-reflection-${namespace}-${runId}`,
  }));
  getMatchmakingDomainRuntime().persistence.recordReflection({
    runId,
    kind: "post_meeting",
    text,
  });
}
