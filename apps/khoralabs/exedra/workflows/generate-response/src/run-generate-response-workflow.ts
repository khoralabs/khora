import { recordTurnAttribution } from "@khoralabs/agent-capabilities";
import type { ChatService, PostModelMetadata, PostUsage } from "@khoralabs/chat-core";
import type { UIMessage } from "ai";
import { stepCountIs, streamText } from "ai";

import {
  captureGenerateResponseCapabilities,
  getAgentRegistry,
  registerGenerateResponseAgent,
  resolveGatewayModel,
} from "./agent-runtime.ts";
import { type AuthzClient, createExedraAuthzClient } from "./authz-client.ts";
import {
  createGenerateResponseChatWriter,
  createGenerateResponseHttpChatWriter,
} from "./chat-writer.ts";
import { normalizeGenerateResponseContext } from "./context.ts";
import { createExedraInternalClient, type ExedraInternalClient } from "./exedra-internal-client.ts";
import { evaluateGenerateResponsePolicies } from "./policies/index.ts";
import {
  discoverBundledSkills,
  formatSkillCatalog,
  selectSkillsByName,
} from "./skills/registry.ts";
import { activateSkillByName } from "./tools/activate-skill.ts";
import { createExedraMemoryClient, type MemoryClient } from "./tools/index.ts";
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

function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const record = error as Record<string, unknown>;
  const direct = typeof record.message === "string" ? record.message : undefined;
  if (direct !== undefined && direct !== "[object Object]") return direct;

  const data = record.data;
  if (data && typeof data === "object") {
    const nested = (data as { error?: { message?: unknown } }).error?.message;
    if (typeof nested === "string") return nested;
  }

  const cause = record.cause;
  if (cause !== undefined && cause !== error) return errorMessage(cause);

  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errorMessage(errors[errors.length - 1]);
  }

  return direct ?? String(error);
}

function userFacingGenerationError(): string {
  return "I couldn't generate a response. Please try again.";
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
  const allSkills = await discoverBundledSkills();
  const selectedSkills = selectSkillsByName(allSkills, policyState.skillNames);
  const context = await normalizeGenerateResponseContext(params, policyState);

  const registry = getAgentRegistry();
  const { agent } = await registerGenerateResponseAgent(registry, allSkills);
  const memoryClient = deps.memoryClient ?? createExedraMemoryClient(getExedraClient());
  const env = {
    policyState,
    memoryClient,
    skills: selectedSkills,
    activatedSkillNames: new Set<string>(),
  };
  const explicitSkillContents = policyState.skillNames
    .map((name) => activateSkillByName(env, name).content)
    .filter((content): content is string => content !== undefined);
  const { capture, aiTools, capabilities } = await captureGenerateResponseCapabilities({
    agent,
    env,
    params,
  });

  const writer =
    deps.chatService !== undefined
      ? createGenerateResponseChatWriter(deps.chatService, params, policyState)
      : createGenerateResponseHttpChatWriter(getExedraClient(), params, policyState);
  let text = "";
  let streamStarted = false;
  const modelId = resolveGatewayModel(params.model.id);
  const runStreamText = deps.streamTextFn ?? streamText;
  let generationError: unknown;

  try {
    await writer.start(assistantMessage(writer.postId, ""));
    streamStarted = true;

    const maxSteps = params.model.maxSteps ?? 8;
    const result = runStreamText({
      model: modelId,
      system: [
        capture.instructions,
        formatSkillCatalog(selectedSkills),
        ...explicitSkillContents,
        ...context.instructions,
      ]
        .filter((part) => part.length > 0)
        .join("\n\n"),
      messages: context.modelMessages,
      tools: aiTools,
      stopWhen: stepCountIs(maxSteps),
      onError: ({ error }) => {
        generationError = error;
      },
    } as Parameters<typeof streamText>[0]);
    const finishReasonPromise = Promise.resolve(result.finishReason).catch(() => undefined);
    const usagePromise = Promise.resolve(result.usage).catch(() => undefined);
    const responsePromise = Promise.resolve(result.response).catch(() => undefined);
    const textPromise = Promise.resolve(result.text).catch(() => "");

    try {
      for await (const delta of result.textStream) {
        text += delta;
        if (params.output.chat.streamDeltas) {
          await writer.apply(assistantMessage(writer.postId, text));
        }
      }
    } catch (error) {
      generationError = error;
      // Fall back to result.text when the stream fails after partial output.
    }

    text = text.length > 0 ? text : await textPromise;
    if (text.length === 0) {
      const detail = generationError === undefined ? "" : `: ${errorMessage(generationError)}`;
      throw new Error(`generate response produced no text output${detail}`);
    }

    const [finishReason, usage, response] = await Promise.all([
      finishReasonPromise,
      usagePromise,
      responsePromise,
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
      chat: {
        threadId: params.output.chat.threadId,
        postId: writer.postId,
        status: "complete",
      },
      message,
      summary: params.output.mode === "summary" ? text : undefined,
      structured: params.output.mode === "investigation" ? { answer: text } : undefined,
      capabilities,
    };
  } catch (error) {
    if (streamStarted && text.length === 0) {
      await writer
        .apply(assistantMessage(writer.postId, userFacingGenerationError()))
        .then(() => writer.complete())
        .catch(() => undefined);
    } else if (streamStarted) {
      await writer.abort().catch(() => undefined);
    }
    throw error;
  }
}
