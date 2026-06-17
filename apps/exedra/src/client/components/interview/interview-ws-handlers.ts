import type { ChatStatus } from "ai";
import { nanoid } from "nanoid";
import type { Dispatch, RefObject, SetStateAction } from "react";

import type { BeliefFlag, ChatMessage } from "@/lib/interview-api";

import { upsertStreamingToolCall } from "./interview-chat-tool-utils";
import type { WsServerMessage } from "./interview-chat-types";

export type InterviewWsHandlerContext = {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setStatus: Dispatch<SetStateAction<ChatStatus>>;
  setAwaitingOpening: Dispatch<SetStateAction<boolean>>;
  setChatError: Dispatch<SetStateAction<string | null>>;
  streamingIdRef: RefObject<string | null>;
  beliefsRef: RefObject<BeliefFlag[]>;
  onBeliefsChange: (beliefs: BeliefFlag[]) => void;
  onOnboardingComplete?: () => void;
};

type UserMessageSaved = Extract<WsServerMessage, { type: "user_message_saved" }>;
type TextDelta = Extract<WsServerMessage, { type: "text_delta" }>;
type ToolCall = Extract<WsServerMessage, { type: "tool_call" }>;
type ToolResult = Extract<WsServerMessage, { type: "tool_result" }>;
type ToolError = Extract<WsServerMessage, { type: "tool_error" }>;
type AssistantMessage = Extract<WsServerMessage, { type: "assistant_message" }>;
type BeliefFlagMessage = Extract<WsServerMessage, { type: "belief_flag" }>;
type ErrorMessage = Extract<WsServerMessage, { type: "error" }>;

export function handleUserMessageSaved(message: UserMessageSaved, ctx: InterviewWsHandlerContext) {
  if (message.message.metadata?.kickoff === true) return;

  const text = message.message.parts.map((part) => part.text).join("");
  ctx.setMessages((current) => {
    let replaced = false;
    return current.map((entry) => {
      if (!replaced && entry.id.startsWith("temp-") && entry.role === "user") {
        replaced = true;
        return {
          id: message.message.id,
          role: "user",
          content: text,
          attachments: message.message.metadata?.documents,
        };
      }
      return entry;
    });
  });
}

export function handleTextDelta(message: TextDelta, ctx: InterviewWsHandlerContext) {
  ctx.setAwaitingOpening(false);
  const streamingId = ctx.streamingIdRef.current ?? nanoid();
  ctx.streamingIdRef.current = streamingId;
  ctx.setMessages((current) => {
    const existing = current.find((entry) => entry.id === streamingId);
    if (existing !== undefined) {
      return current.map((entry) =>
        entry.id === streamingId ? { ...entry, content: entry.content + message.delta } : entry,
      );
    }
    return [...current, { id: streamingId, role: "assistant", content: message.delta }];
  });
  ctx.setStatus("streaming");
}

export function handleToolCall(message: ToolCall, ctx: InterviewWsHandlerContext) {
  ctx.setAwaitingOpening(false);
  const streamingId = ctx.streamingIdRef.current ?? nanoid();
  ctx.streamingIdRef.current = streamingId;
  ctx.setMessages((current) =>
    upsertStreamingToolCall(current, streamingId, {
      id: message.toolCallId,
      toolName: message.toolName,
      input: message.input,
      state: "running",
    }),
  );
  ctx.setStatus("streaming");
}

export function handleToolResult(message: ToolResult, ctx: InterviewWsHandlerContext) {
  const streamingId = ctx.streamingIdRef.current;
  if (streamingId === null) return;
  ctx.setMessages((current) =>
    upsertStreamingToolCall(current, streamingId, {
      id: message.toolCallId,
      toolName: message.toolName,
      output: message.output,
      state: "completed",
    }),
  );
}

export function handleToolError(message: ToolError, ctx: InterviewWsHandlerContext) {
  const streamingId = ctx.streamingIdRef.current;
  if (streamingId === null) return;
  ctx.setMessages((current) =>
    upsertStreamingToolCall(current, streamingId, {
      id: message.toolCallId,
      toolName: message.toolName,
      errorText: message.errorText,
      state: "error",
    }),
  );
}

export function handleAssistantMessage(message: AssistantMessage, ctx: InterviewWsHandlerContext) {
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
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      },
    ];
  });
  ctx.setStatus("ready");
  if (message.onboardingCompleted === true) {
    ctx.onOnboardingComplete?.();
  }
}

export function handleOnboardingComplete(ctx: InterviewWsHandlerContext) {
  ctx.onOnboardingComplete?.();
}

export function handleBeliefFlag(message: BeliefFlagMessage, ctx: InterviewWsHandlerContext) {
  ctx.beliefsRef.current = [
    ...ctx.beliefsRef.current,
    {
      id: nanoid(),
      belief: message.belief,
      sourceMessageId: message.sourceMessageId,
    },
  ];
  ctx.onBeliefsChange(ctx.beliefsRef.current);
}

export function handleWsError(message: ErrorMessage, ctx: InterviewWsHandlerContext) {
  ctx.streamingIdRef.current = null;
  ctx.setAwaitingOpening(false);
  ctx.setChatError(message.error);
  ctx.setStatus("ready");
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
    case "onboarding_complete":
      handleOnboardingComplete(ctx);
      return;
    case "belief_flag":
      handleBeliefFlag(parsed, ctx);
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
