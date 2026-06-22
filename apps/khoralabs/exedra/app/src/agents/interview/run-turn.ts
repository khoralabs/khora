import {
  type AgentRegistry,
  AgentSessionAbortedError,
  captureAgentSnapshotEnvelope,
  type PolicyResultMap,
  type RegisteredAgent,
  type SessionContext,
} from "@khoralabs/agent-capabilities";
import { toolMapToAiTools } from "@khoralabs/agent-capabilities-ai-sdk";
import type { AgentTelemetry } from "@khoralabs/agent-capabilities-otel";
import {
  convertToModelMessages,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  type Tool,
  type ToolSet,
  type UIMessage,
} from "ai";

type InterviewToolSet = Record<string, Tool<unknown, unknown>> & ToolSet;

import type { TurnDocumentAttachment } from "../../server/documents/load-turn-attachments.js";
import type { InterviewMemoryContext } from "../../server/interview/memory-retrieval.js";
import {
  searchOrgMemoriesForInterview,
  searchPersonalMemoriesForInterview,
} from "../../server/interview/memory-retrieval.js";
import { logger } from "../../server/logger.js";
import { createExedraAgentTelemetry } from "../../server/telemetry/agent-telemetry.js";
import { isAbortError, TurnAbortedError } from "../errors.js";
import {
  buildUserLocalDateTimeContext,
  formatUserLocalDateTimeTurnInstruction,
} from "../turn-context/user-local-datetime.js";
import type { InterviewSessionMeta } from "./instructions.js";
import {
  countNonKickoffUserTurns,
  isKickoffUserMessage,
  ONBOARDING_MIN_USER_TURNS,
  type OnboardingInterviewMeta,
  postInterviewInstruction,
} from "./instructions.js";
import { ensureInterviewAgentRegistered } from "./session.js";
import { buildSessionClosingMessage, type SessionCompletionPayload } from "./session-closing.js";
import type { InterviewEnv } from "./toolkit.js";

export type { SessionCompletionPayload };

export type InterviewToolEvent =
  | { type: "call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "error"; toolCallId: string; toolName: string; errorText: string };

export type InterviewTurnInput = {
  model: LanguageModel;
  threadId: string;
  userMessageId: string;
  history: UIMessage[];
  userTimeZone?: string;
  onboardingMeta?: OnboardingInterviewMeta;
  sessionInterviewComplete: boolean;
  memoryContext?: string | null;
  interviewMemoryContext?: InterviewMemoryContext;
  documentAttachments?: readonly TurnDocumentAttachment[];
  onTextDelta: (delta: string) => void;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
  onCompleteSession?: (payload: SessionCompletionPayload) => void;
  onToolEvent?: (event: InterviewToolEvent) => void;
};

export type InterviewTurnOutput = {
  assistantParts: UIMessage["parts"];
  beliefFlags: { belief: string; messageId: string }[];
  sessionCompleted: boolean;
  sessionCompletion: SessionCompletionPayload | null;
};

function upsertToolPart(
  parts: UIMessage["parts"],
  toolCallId: string,
  toolName: string,
  update: {
    state: "input-available" | "output-available" | "output-error";
    input?: unknown;
    output?: unknown;
    errorText?: string;
  },
): void {
  const type = `tool-${toolName}` as UIMessage["parts"][number]["type"];
  const index = parts.findIndex(
    (part) =>
      typeof part.type === "string" &&
      part.type.startsWith("tool-") &&
      "toolCallId" in part &&
      part.toolCallId === toolCallId,
  );

  const nextPart = {
    type,
    toolCallId,
    state: update.state,
    ...(update.input !== undefined ? { input: update.input } : {}),
    ...(update.output !== undefined ? { output: update.output } : {}),
    ...(update.errorText !== undefined ? { errorText: update.errorText } : {}),
  } as UIMessage["parts"][number];

  if (index >= 0) {
    parts[index] = nextPart;
    return;
  }

  parts.push(nextPart);
}

function formatToolError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const trimmed = error.message.trim();
  if (!trimmed.startsWith("[")) return error.message;
  try {
    const issues = JSON.parse(trimmed) as Array<{ message?: string }>;
    if (issues.length === 1 && typeof issues[0]?.message === "string") {
      return issues[0].message;
    }
  } catch {
    // fall through
  }
  return error.message;
}

function replaceTextParts(parts: UIMessage["parts"], text: string): void {
  const nonText = parts.filter((part) => part.type !== "text");
  const next: UIMessage["parts"] = [...nonText, { type: "text", text }];
  parts.length = 0;
  parts.push(...next);
}

/** Tool UI parts are for display only — strip them before sending history to the model. */
function historyForModel(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((message) => ({
      ...message,
      parts: message.parts.filter((part) => part.type === "text"),
    }))
    .filter((message) => message.parts.length > 0);
}

function attachDocumentsToModelMessages(
  messages: ModelMessage[],
  userMessageId: string,
  history: UIMessage[],
  attachments: readonly TurnDocumentAttachment[],
): ModelMessage[] {
  if (attachments.length === 0) return messages;

  const triggeringIndex = history.findIndex(
    (message) => message.id === userMessageId && message.role === "user",
  );
  if (triggeringIndex < 0) return messages;

  const userMessageIndices = history
    .map((message, index) => (message.role === "user" ? index : -1))
    .filter((index) => index >= 0);
  const modelUserIndex = userMessageIndices.indexOf(triggeringIndex);
  if (modelUserIndex < 0 || modelUserIndex >= messages.length) return messages;

  const target = messages[modelUserIndex];
  if (target === undefined || target.role !== "user") return messages;

  const fileParts = attachments.map((attachment) => ({
    type: "file" as const,
    data: attachment.bytes,
    mediaType: attachment.mimeType,
  }));

  const existingContent = target.content;
  const nextContent = Array.isArray(existingContent)
    ? [...existingContent, ...fileParts]
    : [{ type: "text" as const, text: String(existingContent) }, ...fileParts];

  const next = [...messages];
  next[modelUserIndex] = { ...target, content: nextContent };
  return next;
}

function allowBeliefFlagForTurn(history: UIMessage[], userMessageId: string): boolean {
  const triggering = history.find((message) => message.id === userMessageId);
  if (triggering === undefined || triggering.role !== "user") return false;
  return !isKickoffUserMessage(triggering);
}

function sessionAbortSignal(context: SessionContext): AbortSignal | undefined {
  const signal = context.abortSignal;
  return signal instanceof AbortSignal ? signal : undefined;
}

async function runInterviewTurnSession(args: {
  agent: RegisteredAgent;
  input: InterviewTurnInput;
  context: SessionContext;
  sessionId: string;
  tel: AgentTelemetry;
}): Promise<InterviewTurnOutput> {
  const { agent, input, context, sessionId, tel } = args;
  const {
    model,
    threadId,
    userMessageId,
    history,
    userTimeZone,
    onboardingMeta,
    sessionInterviewComplete,
    memoryContext,
    interviewMemoryContext,
    onTextDelta,
    onBeliefFlag,
    onCompleteSession,
    onToolEvent,
    documentAttachments = [],
  } = input;

  const abortSignal = sessionAbortSignal(context);
  const isAborted = () => abortSignal?.aborted === true;

  const isOnboarding = onboardingMeta !== undefined;
  const userTurnCount = countNonKickoffUserTurns(history);
  let sessionCompleted = false;
  let sessionCompletion: SessionCompletionPayload | null = null;
  let suppressTextAfterComplete = false;

  const minTurnsForComplete = isOnboarding ? ONBOARDING_MIN_USER_TURNS : 1;
  const allowCompleteSession = !sessionInterviewComplete;
  const allowCompleteSessionByTurnCount = userTurnCount >= minTurnsForComplete;

  const beliefFlags: { belief: string; messageId: string }[] = [];

  const env: InterviewEnv = {
    sourceMessageId: userMessageId,
    allowBeliefFlag: allowBeliefFlagForTurn(history, userMessageId),
    isOnboarding,
    allowCompleteSession,
    allowCompleteSessionByTurnCount,
    onBeliefFlag: (belief, sourceMessageId) => {
      if (isAborted()) return;
      beliefFlags.push({ belief, messageId: sourceMessageId });
      onBeliefFlag(belief, sourceMessageId);
    },
    onCompleteSession: (payload) => {
      if (isAborted()) return;
      sessionCompleted = true;
      sessionCompletion = payload;
      suppressTextAfterComplete = true;
      onCompleteSession?.(payload);
    },
    ...(interviewMemoryContext !== undefined
      ? {
          searchOrgMemories: async (query: string) => {
            const hits = await searchOrgMemoriesForInterview(interviewMemoryContext, query);
            return hits.map((hit) => ({
              source: hit.source,
              key: hit.key,
              snippet: hit.snippet,
            }));
          },
          ...(interviewMemoryContext.canSearchPersonal
            ? {
                searchPersonalMemories: async (query: string) => {
                  const hits = await searchPersonalMemoriesForInterview(
                    interviewMemoryContext,
                    query,
                  );
                  return hits.map((hit) => ({
                    source: hit.source,
                    key: hit.key,
                    snippet: hit.snippet,
                  }));
                },
              }
            : {}),
        }
      : {}),
  };

  const toolkitCtx = {
    env,
    agentId: agent.agentId,
    agentName: agent.name,
    ...(abortSignal !== undefined ? { abortSignal } : {}),
  };

  const userLocalDateTime = buildUserLocalDateTimeContext(userTimeZone);
  const userLocalDateTimeInstruction = formatUserLocalDateTimeTurnInstruction(userLocalDateTime);

  const capture = await tel.traceAffordanceEvaluation(() =>
    captureAgentSnapshotEnvelope({
      agent,
      ctx: { ...toolkitCtx, pipelineHooks: tel.pipelineHooks },
      invocationContext: { threadId, userMessageId, userLocalDateTime },
      sessionContext: { userLocalDateTime },
    }),
  );

  tel.linkCapture({
    link: capture.link,
    toolRefs: capture.toolRefs,
    invocationContext: { threadId, userMessageId, userLocalDateTime },
    sessionContext: capture.envelope.context,
  });

  const resolvedPolicies: PolicyResultMap = new Map();
  const runtime = {
    ...toolkitCtx,
    resolvedPolicies,
    pipelineHooks: tel.pipelineHooks,
  };
  const aiTools = toolMapToAiTools(capture.evaluatedTools, runtime) as InterviewToolSet;
  const registeredToolNames = Object.keys(aiTools);
  logger.debug({ registeredToolNames }, "interview turn registered tools");

  let modelMessages: ModelMessage[];
  const modelHistory = historyForModel(history);
  try {
    modelMessages = await convertToModelMessages(modelHistory);
  } catch {
    modelMessages = modelHistory.map((m) => ({
      role: m.role,
      content: m.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join(""),
    }));
  }

  modelMessages = attachDocumentsToModelMessages(
    modelMessages,
    userMessageId,
    history,
    documentAttachments,
  );

  const systemInstruction = [
    capture.instructions,
    userLocalDateTimeInstruction,
    memoryContext ?? null,
    sessionInterviewComplete ? postInterviewInstruction : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const assistantParts: UIMessage["parts"] = [];
  const result = streamText({
    model,
    system: systemInstruction,
    messages: modelMessages,
    tools: aiTools,
    stopWhen: stepCountIs(8),
    ...(abortSignal !== undefined ? { abortSignal } : {}),
    experimental_telemetry: {
      isEnabled: true,
      functionId: "interview-turn",
      metadata: {
        threadId,
        sessionId,
      },
    },
  });

  for await (const part of result.fullStream) {
    if (isAborted()) break;
    if (part.type === "text-delta") {
      if (suppressTextAfterComplete) continue;
      const delta = part.text;
      if (delta.length === 0) continue;
      const last = assistantParts.at(-1);
      if (last !== undefined && last.type === "text") {
        last.text += delta;
      } else {
        assistantParts.push({ type: "text", text: delta });
      }
      onTextDelta(delta);
      continue;
    }

    if (part.type === "tool-call") {
      upsertToolPart(assistantParts, part.toolCallId, part.toolName, {
        state: "input-available",
        input: part.input,
      });
      onToolEvent?.({
        type: "call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      });
      continue;
    }

    if (part.type === "tool-result") {
      upsertToolPart(assistantParts, part.toolCallId, part.toolName, {
        state: "output-available",
        output: part.output,
      });
      onToolEvent?.({
        type: "result",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: part.output,
      });
      continue;
    }

    if (part.type === "tool-error") {
      const errorText = formatToolError(part.error);
      upsertToolPart(assistantParts, part.toolCallId, part.toolName, {
        state: "output-error",
        errorText,
      });
      onToolEvent?.({
        type: "error",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        errorText,
      });
    }
  }

  if (isAborted()) {
    throw new AgentSessionAbortedError();
  }

  if (sessionCompletion !== null) {
    replaceTextParts(assistantParts, buildSessionClosingMessage(sessionCompletion));
  }

  const finishReason = await result.finishReason;
  const toolPartCount = assistantParts.filter((part) => part.type.startsWith("tool-")).length;
  logger.debug(
    { finishReason, beliefFlags: beliefFlags.length, toolParts: toolPartCount },
    "interview turn finished",
  );

  return { assistantParts, beliefFlags, sessionCompleted, sessionCompletion };
}

export async function runInterviewTurn(args: {
  registry: AgentRegistry;
  model: LanguageModel;
  sessionId: string;
  sessionMeta: InterviewSessionMeta;
  onboardingMeta?: OnboardingInterviewMeta;
  sessionInterviewComplete: boolean;
  orgId: string;
  teamId: string;
  participantUserId: string;
  memoryContext?: string | null;
  interviewMemoryContext?: InterviewMemoryContext;
  threadId: string;
  userMessageId: string;
  history: UIMessage[];
  userTimeZone?: string;
  abortSignal?: AbortSignal;
  documentAttachments?: readonly TurnDocumentAttachment[];
  onTextDelta: (delta: string) => void;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
  onCompleteSession?: (payload: SessionCompletionPayload) => void;
  onToolEvent?: (event: InterviewToolEvent) => void;
}): Promise<InterviewTurnOutput> {
  const { identity } = await ensureInterviewAgentRegistered(
    args.registry,
    args.sessionId,
    args.sessionMeta,
    { onboarding: args.onboardingMeta },
  );

  const turnInput: InterviewTurnInput = {
    model: args.model,
    threadId: args.threadId,
    userMessageId: args.userMessageId,
    history: args.history,
    sessionInterviewComplete: args.sessionInterviewComplete,
    memoryContext: args.memoryContext,
    ...(args.interviewMemoryContext !== undefined
      ? { interviewMemoryContext: args.interviewMemoryContext }
      : {}),
    ...(args.userTimeZone !== undefined ? { userTimeZone: args.userTimeZone } : {}),
    ...(args.onboardingMeta !== undefined ? { onboardingMeta: args.onboardingMeta } : {}),
    ...(args.documentAttachments !== undefined
      ? { documentAttachments: args.documentAttachments }
      : {}),
    onTextDelta: args.onTextDelta,
    onBeliefFlag: args.onBeliefFlag,
    ...(args.onCompleteSession !== undefined ? { onCompleteSession: args.onCompleteSession } : {}),
    ...(args.onToolEvent !== undefined ? { onToolEvent: args.onToolEvent } : {}),
  };

  const tel = createExedraAgentTelemetry();

  const session = args.registry.createSession(identity.agentId, {
    sessionId: args.sessionId,
    hooks: tel.sessionHooks,
    ...(args.abortSignal !== undefined ? { signal: args.abortSignal } : {}),
    run: async ({ agent, input, context }) =>
      runInterviewTurnSession({
        agent,
        input: input as InterviewTurnInput,
        context,
        sessionId: args.sessionId,
        tel,
      }),
  });

  try {
    return await session.start<InterviewTurnInput, InterviewTurnOutput>(turnInput);
  } catch (err) {
    if (isAbortError(err)) {
      throw new TurnAbortedError();
    }
    throw err;
  }
}
