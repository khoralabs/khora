import {
  type AgentRegistry,
  captureAgentSnapshotEnvelope,
  type PolicyResultMap,
} from "@khoralabs/agent-capabilities";
import { toolMapToAiTools } from "@khoralabs/agent-capabilities-ai-sdk";
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
  onTextDelta: (delta: string) => void;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
  onCompleteOnboarding?: (summary: string) => void;
  onToolEvent?: (event: InterviewToolEvent) => void;
}): Promise<{
  assistantParts: UIMessage["parts"];
  beliefFlags: { belief: string; messageId: string }[];
  onboardingCompleted: boolean;
}> {
  const {
    registry,
    model,
    sessionId,
    sessionMeta,
    onboardingMeta,
    threadId,
    userMessageId,
    history,
    userTimeZone,
    onTextDelta,
    onBeliefFlag,
    onCompleteOnboarding,
    onToolEvent,
  } = args;

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
      beliefFlags.push({ belief, messageId: sourceMessageId });
      onBeliefFlag(belief, sourceMessageId);
    },
    onCompleteOnboarding: (summary) => {
      onboardingCompleted = true;
      onCompleteOnboarding?.(summary);
    },
  };

  const { identity } = await ensureInterviewAgentRegistered(registry, sessionId, sessionMeta, {
    onboarding: onboardingMeta,
  });
  const agentId = identity.agentId;

  const toolkitCtx = {
    env,
    agentId,
    agentName: identity.name,
  };

  const userLocalDateTime = buildUserLocalDateTimeContext(userTimeZone);
  const userLocalDateTimeInstruction = formatUserLocalDateTimeTurnInstruction(userLocalDateTime);

  const capture = await captureAgentSnapshotEnvelope({
    agent: identity,
    ctx: toolkitCtx,
    invocationContext: { threadId, userMessageId, userLocalDateTime },
    sessionContext: { userLocalDateTime },
  });

  const resolvedPolicies: PolicyResultMap = new Map();
  const runtime = {
    ...toolkitCtx,
    resolvedPolicies,
  };
  const aiTools = toolMapToAiTools(capture.evaluatedTools, runtime) as InterviewToolSet;
  const registeredToolNames = Object.keys(aiTools);
  if (process.env.NODE_ENV !== "production") {
    console.log("[interview-turn] registered tools:", registeredToolNames);
  }

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
  });

  for await (const part of result.fullStream) {
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

  if (process.env.NODE_ENV !== "production") {
    const finishReason = await result.finishReason;
    const toolPartCount = assistantParts.filter((part) => part.type.startsWith("tool-")).length;
    console.log("[interview-turn] finish:", finishReason, {
      beliefFlags: beliefFlags.length,
      toolParts: toolPartCount,
    });
  }

  return { assistantParts, beliefFlags, onboardingCompleted };
}
