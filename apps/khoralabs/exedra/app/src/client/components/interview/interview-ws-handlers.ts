import type { MessageAuthor } from "@shared/messages/author";
import type { ChatStatus } from "ai";
import { nanoid } from "nanoid";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { BeliefFlag, ChatMessage } from "@/lib/interview-api";

import { upsertStreamingToolCall } from "./interview-chat-tool-utils";
import type { SessionCompletePayload, WsServerMessage } from "./interview-chat-types";
import { assistantStreamId } from "./interview-turn-ids";

export type InterviewWsHandlerContext = {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setStatus: Dispatch<SetStateAction<ChatStatus>>;
  setAwaitingOpening: Dispatch<SetStateAction<boolean>>;
  setChatError: Dispatch<SetStateAction<string | null>>;
  streamingIdRef: RefObject<string | null>;
  beliefsRef: RefObject<BeliefFlag[]>;
  agentAuthor: MessageAuthor | null;
  onBeliefsChange: (beliefs: BeliefFlag[]) => void;
  onSessionComplete?: (payload: SessionCompletePayload) => void;
  shouldAcceptStreamUpdates?: () => boolean;
  onTurnComplete?: () => void;
  onTurnAborted?: (turnId: string) => void;
  onTurnFailed?: (turnId: string, error: string) => void;
};

function ignoreStreamUpdate(ctx: InterviewWsHandlerContext): boolean {
  return ctx.shouldAcceptStreamUpdates?.() === false;
}

function mergeBeliefFlagsIntoPanel(
  ctx: InterviewWsHandlerContext,
  flags: readonly { belief: string; messageId: string }[],
  idPrefix: string,
): void {
  if (flags.length === 0) return;

  const existing = new Set(
    ctx.beliefsRef.current.map((belief) => `${belief.sourceMessageId}\0${belief.belief}`),
  );
  const added = flags
    .filter((flag) => !existing.has(`${flag.messageId}\0${flag.belief}`))
    .map((flag, index) => ({
      id: `${idPrefix}:${index}`,
      belief: flag.belief,
      sourceMessageId: flag.messageId,
    }));

  if (added.length === 0) return;

  ctx.beliefsRef.current = [...ctx.beliefsRef.current, ...added];
  ctx.onBeliefsChange(ctx.beliefsRef.current);
}

type UserMessageSaved = Extract<WsServerMessage, { type: "user_message_saved" }>;
type TextDelta = Extract<WsServerMessage, { type: "text_delta" }>;
type ToolCall = Extract<WsServerMessage, { type: "tool_call" }>;
type ToolResult = Extract<WsServerMessage, { type: "tool_result" }>;
type ToolError = Extract<WsServerMessage, { type: "tool_error" }>;
type AssistantMessage = Extract<WsServerMessage, { type: "assistant_message" }>;
type BeliefFlagMessage = Extract<WsServerMessage, { type: "belief_flag" }>;
type ErrorMessage = Extract<WsServerMessage, { type: "error" }>;
type TurnFailedMessage = Extract<WsServerMessage, { type: "turn_failed" }>;

function resolveStreamingId(turnId: string | undefined, ctx: InterviewWsHandlerContext): string {
  if (turnId !== undefined) {
    const streamId = assistantStreamId(turnId);
    ctx.streamingIdRef.current = streamId;
    return streamId;
  }
  const existing = ctx.streamingIdRef.current;
  if (existing !== null) return existing;
  const streamId = nanoid();
  ctx.streamingIdRef.current = streamId;
  return streamId;
}

type TurnAbortedMessage = Extract<WsServerMessage, { type: "turn_aborted" }>;

export function handleUserMessageSaved(message: UserMessageSaved, ctx: InterviewWsHandlerContext) {
  if (ignoreStreamUpdate(ctx)) return;
  if (message.message.metadata?.kickoff === true) return;

  const text = message.message.parts.map((part) => part.text).join("");
  ctx.setMessages((current) => {
    const existing = current.find(
      (entry) => entry.id === message.message.id && entry.role === "user",
    );
    if (existing !== undefined) {
      return current.map((entry) =>
        entry.id === message.message.id
          ? {
              ...entry,
              content: text,
              createdAtMs: message.createdAtMs,
              author: message.author ?? entry.author,
              attachments: message.message.metadata?.documents,
            }
          : entry,
      );
    }
    return [
      ...current,
      {
        id: message.message.id,
        role: "user",
        content: text,
        createdAtMs: message.createdAtMs,
        author: message.author,
        attachments: message.message.metadata?.documents,
      },
    ];
  });
}

export function handleTextDelta(message: TextDelta, ctx: InterviewWsHandlerContext) {
  if (ignoreStreamUpdate(ctx)) return;
  ctx.setAwaitingOpening(false);
  const streamingId = resolveStreamingId(message.turnId, ctx);
  ctx.setMessages((current) => {
    const existing = current.find((entry) => entry.id === streamingId);
    if (existing !== undefined) {
      return current.map((entry) =>
        entry.id === streamingId ? { ...entry, content: entry.content + message.delta } : entry,
      );
    }
    return [
      ...current,
      {
        id: streamingId,
        role: "assistant",
        content: message.delta,
        createdAtMs: Date.now(),
        author: ctx.agentAuthor,
      },
    ];
  });
  ctx.setStatus("streaming");
}

export function handleToolCall(message: ToolCall, ctx: InterviewWsHandlerContext) {
  if (ignoreStreamUpdate(ctx)) return;
  ctx.setAwaitingOpening(false);
  const streamingId = resolveStreamingId(message.turnId, ctx);
  ctx.setMessages((current) =>
    upsertStreamingToolCall(
      current,
      streamingId,
      {
        id: message.toolCallId,
        toolName: message.toolName,
        input: message.input,
        state: "running",
      },
      ctx.agentAuthor,
    ),
  );
  ctx.setStatus("streaming");
}

export function handleToolResult(message: ToolResult, ctx: InterviewWsHandlerContext) {
  if (ignoreStreamUpdate(ctx)) return;
  const streamingId = resolveStreamingId(message.turnId, ctx);
  ctx.setMessages((current) =>
    upsertStreamingToolCall(
      current,
      streamingId,
      {
        id: message.toolCallId,
        toolName: message.toolName,
        output: message.output,
        state: "completed",
      },
      ctx.agentAuthor,
    ),
  );
}

export function handleToolError(message: ToolError, ctx: InterviewWsHandlerContext) {
  if (ignoreStreamUpdate(ctx)) return;
  const streamingId = resolveStreamingId(message.turnId, ctx);
  ctx.setMessages((current) =>
    upsertStreamingToolCall(
      current,
      streamingId,
      {
        id: message.toolCallId,
        toolName: message.toolName,
        errorText: message.errorText,
        state: "error",
      },
      ctx.agentAuthor,
    ),
  );
}

export function handleAssistantMessage(message: AssistantMessage, ctx: InterviewWsHandlerContext) {
  if (ignoreStreamUpdate(ctx)) return;
  ctx.setAwaitingOpening(false);
  const text = message.message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
  const toolCalls = message.message.parts
    .filter((part) => typeof part.type === "string" && part.type.startsWith("tool-"))
    .map((part, index) => {
      const toolPart = part as {
        toolCallId?: string;
        state?: string;
        input?: unknown;
        output?: unknown;
        errorText?: string;
      };
      const toolName = part.type.slice("tool-".length);
      return {
        id: toolPart.toolCallId ?? `${toolName}-${index}`,
        toolName,
        input: toolPart.input,
        output: toolPart.output,
        errorText: toolPart.errorText,
        state:
          toolPart.state === "output-available"
            ? ("completed" as const)
            : toolPart.state === "output-error"
              ? ("error" as const)
              : ("running" as const),
      };
    });
  const streamingId = ctx.streamingIdRef.current;
  ctx.streamingIdRef.current = null;
  ctx.setMessages((current) => {
    const withoutStreaming = streamingId
      ? current.filter((entry) => entry.id !== streamingId)
      : current;
    return [
      ...withoutStreaming,
      {
        id: message.message.id,
        role: "assistant",
        content: text,
        createdAtMs: message.createdAtMs,
        author: message.author ?? ctx.agentAuthor,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      },
    ];
  });
  ctx.setStatus("ready");
  mergeBeliefFlagsIntoPanel(ctx, message.message.metadata?.beliefFlags ?? [], message.message.id);
  ctx.onTurnComplete?.();
}

export function handleSessionComplete(
  message: Extract<WsServerMessage, { type: "session_complete" }>,
  ctx: InterviewWsHandlerContext,
) {
  if (ignoreStreamUpdate(ctx)) return;
  ctx.onSessionComplete?.(message.completion);
}

export function handleLegacyOnboardingComplete(
  message: Extract<WsServerMessage, { type: "onboarding_complete" }>,
  ctx: InterviewWsHandlerContext,
) {
  if (ignoreStreamUpdate(ctx)) return;
  ctx.onSessionComplete?.({
    summary: message.summary,
    sessionKind: "onboarding",
  });
}

export function handleBeliefFlag(message: BeliefFlagMessage, ctx: InterviewWsHandlerContext) {
  if (ignoreStreamUpdate(ctx)) return;
  mergeBeliefFlagsIntoPanel(
    ctx,
    [{ belief: message.belief, messageId: message.sourceMessageId }],
    message.turnId,
  );
}

export function handleTurnAborted(message: TurnAbortedMessage, ctx: InterviewWsHandlerContext) {
  ctx.streamingIdRef.current = null;
  ctx.setAwaitingOpening(false);
  ctx.setStatus("ready");
  ctx.onTurnAborted?.(message.turnId);
  ctx.onTurnComplete?.();
}

export function handleTurnFailed(message: TurnFailedMessage, ctx: InterviewWsHandlerContext) {
  ctx.streamingIdRef.current = null;
  ctx.setAwaitingOpening(false);
  ctx.setStatus("ready");
  ctx.setChatError(null);
  ctx.onTurnFailed?.(message.turnId, message.error);
  ctx.onTurnComplete?.();
}

export function handleWsError(message: ErrorMessage, ctx: InterviewWsHandlerContext) {
  if (ignoreStreamUpdate(ctx)) return;
  ctx.streamingIdRef.current = null;
  ctx.setAwaitingOpening(false);
  ctx.setChatError(message.error);
  ctx.setStatus("ready");
  ctx.onTurnComplete?.();
}

export function dispatchWsMessage(parsed: WsServerMessage, ctx: InterviewWsHandlerContext): void {
  switch (parsed.type) {
    case "ready":
    case "pong":
      return;
    case "user_message_saved":
      handleUserMessageSaved(parsed, ctx);
      return;
    case "text_delta":
      handleTextDelta(parsed, ctx);
      return;
    case "tool_call":
      handleToolCall(parsed, ctx);
      return;
    case "tool_result":
      handleToolResult(parsed, ctx);
      return;
    case "tool_error":
      handleToolError(parsed, ctx);
      return;
    case "assistant_message":
      handleAssistantMessage(parsed, ctx);
      return;
    case "session_complete":
      handleSessionComplete(parsed, ctx);
      return;
    case "onboarding_complete":
      handleLegacyOnboardingComplete(parsed, ctx);
      return;
    case "belief_flag":
      handleBeliefFlag(parsed, ctx);
      return;
    case "turn_aborted":
      handleTurnAborted(parsed, ctx);
      return;
    case "turn_failed":
      handleTurnFailed(parsed, ctx);
      return;
    case "error":
      handleWsError(parsed, ctx);
      return;
  }
}

export function parseWsMessage(raw: string): WsServerMessage | null {
  try {
    return JSON.parse(raw) as WsServerMessage;
  } catch {
    return null;
  }
}
