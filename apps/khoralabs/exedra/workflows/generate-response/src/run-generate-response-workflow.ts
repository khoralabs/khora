import { recordTurnAttribution } from "@khoralabs/agent-capabilities";
import type { ChatService, PostModelMetadata, PostUsage } from "@khoralabs/chat-core";
import type { UIMessage } from "ai";
import { streamText } from "ai";

import {
  captureGenerateResponseCapabilities,
  getAgentRegistry,
  registerGenerateResponseAgent,
  resolveGatewayModel,
} from "./agent-runtime.ts";
import { type AuthzClient, createExedraAuthzClient } from "./authz-client.ts";
import { createDefaultChatService, createGenerateResponseChatWriter } from "./chat-writer.ts";
import { normalizeGenerateResponseContext } from "./context.ts";
import { createExedraInternalClient, type ExedraInternalClient } from "./exedra-internal-client.ts";
import { createExedraMemoryClient, type MemoryClient } from "./memory-toolkit.ts";
import { evaluateGenerateResponsePolicies } from "./policies.ts";
import type { GenerateResponseResult, GenerateResponseWorkflowParams } from "./types.ts";

export type RunGenerateResponseDependencies = {
  attributionPersistence?: Parameters<typeof recordTurnAttribution>[0];
  authzClient?: AuthzClient;
  chatService?: ChatService;
  exedraClient?: ExedraInternalClient;
  memoryClient?: MemoryClient;
  streamTextFn?: typeof streamText;
};

function assistantMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: text.length > 0 ? [{ type: "text", text }] : [],
  };
}

function usageFromAiSdk(usage: unknown): PostUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const value = usage as Record<string, unknown>;
  return {
    inputTokens: numberOrUndefined(value.inputTokens ?? value.promptTokens),
    outputTokens: numberOrUndefined(value.outputTokens ?? value.completionTokens),
    totalTokens: numberOrUndefined(value.totalTokens),
    reasoningTokens: numberOrUndefined(value.reasoningTokens),
    cachedInputTokens: numberOrUndefined(value.cachedInputTokens),
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function modelMetadata(input: {
  requestedModel: string;
  finishReason?: unknown;
  response?: unknown;
}): PostModelMetadata {
  const response = input.response && typeof input.response === "object" ? input.response : {};
  const record = response as Record<string, unknown>;
  return {
    provider: typeof record.provider === "string" ? record.provider : undefined,
    model: typeof record.modelId === "string" ? record.modelId : undefined,
    gatewayModel: input.requestedModel,
    finishReason: typeof input.finishReason === "string" ? input.finishReason : undefined,
  };
}

export async function runGenerateResponseWorkflow(
  params: GenerateResponseWorkflowParams,
  deps: RunGenerateResponseDependencies = {},
): Promise<GenerateResponseResult> {
  let exedraClient = deps.exedraClient;
  const getExedraClient = () => {
    exedraClient ??= createExedraInternalClient();
    return exedraClient;
  };
  const authzClient = deps.authzClient ?? createExedraAuthzClient(getExedraClient());
  const policyState = await evaluateGenerateResponsePolicies(params, authzClient);
  const context = await normalizeGenerateResponseContext(params, policyState);

  const registry = getAgentRegistry();
  const { agent } = await registerGenerateResponseAgent(registry, params, context.instructions);
  const memoryClient = deps.memoryClient ?? createExedraMemoryClient(getExedraClient());
  const { capture, aiTools, capabilities } = await captureGenerateResponseCapabilities({
    agent,
    env: { policyState, memoryClient },
    params,
  });

  const chatService = deps.chatService ?? createDefaultChatService();
  const writer = createGenerateResponseChatWriter(chatService, params, policyState);
  let text = "";
  let streamStarted = false;
  const modelId = resolveGatewayModel(params.model.id);
  const runStreamText = deps.streamTextFn ?? streamText;

  try {
    await writer.start(assistantMessage(writer.postId, ""));
    streamStarted = true;

    const result = runStreamText({
      model: modelId,
      system: capture.instructions,
      messages: context.modelMessages,
      tools: aiTools,
      maxSteps: params.model.maxSteps,
    } as Parameters<typeof streamText>[0]);

    for await (const delta of result.textStream) {
      text += delta;
      if (params.output.chat.streamDeltas) {
        await writer.apply(assistantMessage(writer.postId, text));
      }
    }

    const resultRecord = result as unknown as Record<string, unknown>;
    const [finishReason, usage, response] = await Promise.all([
      Promise.resolve(resultRecord.finishReason).catch(() => undefined),
      Promise.resolve(resultRecord.usage).catch(() => undefined),
      Promise.resolve(resultRecord.response).catch(() => undefined),
    ]);
    const metadata = {
      model: modelMetadata({ requestedModel: modelId, finishReason, response }),
      usage: usageFromAiSdk(usage),
    };
    await writer.apply(assistantMessage(writer.postId, text), metadata);
    const message = await writer.complete();

    if (deps.attributionPersistence !== undefined) {
      await recordTurnAttribution(deps.attributionPersistence, {
        op: {
          now: Date.now(),
          tenantId: params.context.orgId,
          actorId: params.agent.actingFor.id,
        },
        sessionId: params.context.sessionId ?? params.responseId,
        link: capture.link,
        envelope: capture.envelope,
        linkMetadata: { responseId: params.responseId, postId: writer.postId },
        envelopeMetadata: {
          invocationContext: params.context.invocationContext,
          sessionContext: capture.envelope.context,
        },
      });
    }

    return {
      responseId: params.responseId,
      kind: params.kind,
      chat: {
        threadId: params.output.chat.threadId,
        postId: writer.postId,
        status: "complete",
      },
      message,
      summary: params.output.mode === "summary" ? text : undefined,
      capabilities,
    };
  } catch (error) {
    if (streamStarted) await writer.abort().catch(() => undefined);
    throw error;
  }
}
