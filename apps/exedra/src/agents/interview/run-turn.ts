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
} from "./instructions.js";
import { ensureInterviewAgentRegistered } from "./session.js";
import type { InterviewEnv } from "./toolkit.js";

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
  onTextDelta: (delta: string) => void;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
  onCompleteOnboarding?: (summary: string) => void;
  onToolEvent?: (event: InterviewToolEvent) => void;
};

export type InterviewTurnOutput = {
  assistantParts: UIMessage["parts"];
  beliefFlags: { belief: string; messageId: string }[];
  onboardingCompleted: boolean;
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

/** Tool UI parts are for display only — strip them before sending history to the model. */
function historyForModel(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((message) => ({
      ...message,
      parts: message.parts.filter((part) => part.type === "text"),
    }))
    .filter((message) => message.parts.length > 0);
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
    onTextDelta,
    onBeliefFlag,
    onCompleteOnboarding,
    onToolEvent,
  } = input;

  const abortSignal = sessionAbortSignal(context);
  const isAborted = () => abortSignal?.aborted === true;

  const isOnboarding = onboardingMeta !== undefined;
  const userTurnCount = countNonKickoffUserTurns(history);
  let onboardingCompleted = false;

  const beliefFlags: { belief: string; messageId: string }[] = [];

  const env: InterviewEnv = {
    sourceMessageId: userMessageId,
    allowBeliefFlag: allowBeliefFlagForTurn(history, userMessageId),
    isOnboarding,
    allowCompleteOnboarding: isOnboarding && userTurnCount >= ONBOARDING_MIN_USER_TURNS,
    onBeliefFlag: (belief, sourceMessageId) => {
      if (isAborted()) return;
      beliefFlags.push({ belief, messageId: sourceMessageId });
      onBeliefFlag(belief, sourceMessageId);
    },
    onCompleteOnboarding: (summary) => {
      if (isAborted()) return;
      onboardingCompleted = true;
      onCompleteOnboarding?.(summary);
    },
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

  const assistantParts: UIMessage["parts"] = [];
  const result = streamText({
    model,
    system: [capture.instructions, userLocalDateTimeInstruction].filter(Boolean).join("\n\n"),
    messages: modelMessages,
    tools: aiTools,
    stopWhen: stepCountIs(5),
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
      const errorText = part.error instanceof Error ? part.error.message : String(part.error);
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

  const finishReason = await result.finishReason;
  const toolPartCount = assistantParts.filter((part) => part.type.startsWith("tool-")).length;
  logger.debug(
    { finishReason, beliefFlags: beliefFlags.length, toolParts: toolPartCount },
    "interview turn finished",
  );

  return { assistantParts, beliefFlags, onboardingCompleted };
}

export async function runInterviewTurn(args: {
  registry: AgentRegistry;
  model: LanguageModel;
  sessionId: string;
  sessionMeta: InterviewSessionMeta;
  onboardingMeta?: OnboardingInterviewMeta;
  threadId: string;
  userMessageId: string;
  history: UIMessage[];
  userTimeZone?: string;
  abortSignal?: AbortSignal;
  onTextDelta: (delta: string) => void;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
  onCompleteOnboarding?: (summary: string) => void;
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
    ...(args.userTimeZone !== undefined ? { userTimeZone: args.userTimeZone } : {}),
    ...(args.onboardingMeta !== undefined ? { onboardingMeta: args.onboardingMeta } : {}),
    onTextDelta: args.onTextDelta,
    onBeliefFlag: args.onBeliefFlag,
    ...(args.onCompleteOnboarding !== undefined
      ? { onCompleteOnboarding: args.onCompleteOnboarding }
      : {}),
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
