import type { ChatStatus, UIMessage } from "ai";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Spinner } from "@/components/ui/spinner";
import {
  type BeliefFlag,
  type ChatMessage,
  extractBeliefsFromMessages,
  fetchInterview,
  type InterviewBootstrap,
  interviewWsUrl,
  type ToolCallDisplay,
  uiMessagesToChatMessages,
} from "@/lib/interview-api";

type InterviewChatProps = {
  sessionId: string;
  onBootstrap: (bootstrap: InterviewBootstrap) => void;
  onBeliefsChange: (beliefs: BeliefFlag[]) => void;
  onError: (error: string | null) => void;
  scrollToMessageId?: string | null;
  onScrollToMessageComplete?: () => void;
};

type WsServerMessage =
  | { type: "ready"; threadId: string }
  | {
      type: "user_message_saved";
      message: {
        id: string;
        role: "user";
        parts: { type: "text"; text: string }[];
        metadata?: { kickoff?: boolean };
      };
    }
  | { type: "text_delta"; delta: string }
  | {
      type: "assistant_message";
      message: {
        id: string;
        role: "assistant";
        parts: UIMessage["parts"];
        metadata?: { beliefFlags?: { belief: string; messageId: string }[] };
      };
    }
  | { type: "tool_call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool_error"; toolCallId: string; toolName: string; errorText: string }
  | { type: "belief_flag"; belief: string; sourceMessageId: string }
  | { type: "error"; error: string }
  | { type: "pong" };

function upsertMessageToolCall(message: ChatMessage, toolCall: ToolCallDisplay): ChatMessage {
  const existing = message.toolCalls ?? [];
  const index = existing.findIndex((call) => call.id === toolCall.id);
  if (index >= 0) {
    const next = [...existing];
    next[index] = { ...next[index], ...toolCall };
    return { ...message, toolCalls: next };
  }
  return { ...message, toolCalls: [...existing, toolCall] };
}

function upsertStreamingToolCall(
  messages: ChatMessage[],
  streamingId: string,
  toolCall: ToolCallDisplay,
): ChatMessage[] {
  const existing = messages.find((message) => message.id === streamingId);
  if (existing !== undefined) {
    return messages.map((message) =>
      message.id === streamingId ? upsertMessageToolCall(message, toolCall) : message,
    );
  }
  return [...messages, { id: streamingId, role: "assistant", content: "", toolCalls: [toolCall] }];
}

function toolStateForDisplay(state: ToolCallDisplay["state"]) {
  if (state === "completed") return "output-available" as const;
  if (state === "error") return "output-error" as const;
  return "input-available" as const;
}

function InterviewToolCall({ toolCall }: { toolCall: ToolCallDisplay }) {
  const toolType = `tool-${toolCall.toolName}` as `tool-${string}`;
  const title = toolCall.toolName === "flagBelief" ? "Flag belief" : toolCall.toolName;

  return (
    <Tool defaultOpen={process.env.NODE_ENV !== "production"}>
      <ToolHeader state={toolStateForDisplay(toolCall.state)} title={title} type={toolType} />
      <ToolContent>
        {toolCall.input !== undefined ? <ToolInput input={toolCall.input} /> : null}
        <ToolOutput errorText={toolCall.errorText} output={toolCall.output} />
      </ToolContent>
    </Tool>
  );
}

export function InterviewChat({
  sessionId,
  onBootstrap,
  onBeliefsChange,
  onError,
  scrollToMessageId,
  onScrollToMessageComplete,
}: InterviewChatProps) {
  const [bootstrap, setBootstrap] = useState<InterviewBootstrap | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [chatError, setChatError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [awaitingOpening, setAwaitingOpening] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const beliefsRef = useRef<BeliefFlag[]>([]);
  const highlightedMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (scrollToMessageId === null || scrollToMessageId === undefined) return;

    const element = document.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(scrollToMessageId)}"]`,
    );
    if (element === null) {
      onScrollToMessageComplete?.();
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("ring-2", "ring-primary/40", "rounded-xl", "transition-shadow");

    if (highlightedMessageRef.current !== null) {
      const previous = document.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(highlightedMessageRef.current)}"]`,
      );
      previous?.classList.remove("ring-2", "ring-primary/40", "rounded-xl", "transition-shadow");
    }
    highlightedMessageRef.current = scrollToMessageId;

    const timeout = window.setTimeout(() => {
      element.classList.remove("ring-2", "ring-primary/40", "rounded-xl", "transition-shadow");
      highlightedMessageRef.current = null;
      onScrollToMessageComplete?.();
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [scrollToMessageId, onScrollToMessageComplete]);

  useEffect(() => {
    let cancelled = false;
    setBootstrap(null);
    setMessages([]);
    setChatError(null);
    setStatus("ready");
    setAwaitingOpening(false);
    beliefsRef.current = [];
    onError(null);

    void fetchInterview(sessionId)
      .then((data) => {
        if (cancelled) return;
        const chatMessages = uiMessagesToChatMessages(data.messages);
        const initialBeliefs = extractBeliefsFromMessages(data.messages);
        beliefsRef.current = initialBeliefs;
        setBootstrap(data);
        onBootstrap(data);
        setMessages(chatMessages);
        onBeliefsChange(initialBeliefs);
        setAwaitingOpening(chatMessages.length === 0);
        if (chatMessages.length === 0) {
          setStatus("submitted");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        onError(err instanceof Error ? err.message : "Failed to load interview");
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, onBootstrap, onBeliefsChange, onError]);

  useEffect(() => {
    if (bootstrap === null) return;

    const ws = new WebSocket(interviewWsUrl(bootstrap.wsUrl));
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setChatError("Connection lost. Refresh to reconnect.");

    ws.onmessage = (event) => {
      let parsed: WsServerMessage;
      try {
        parsed = JSON.parse(String(event.data)) as WsServerMessage;
      } catch {
        return;
      }

      if (parsed.type === "ready") return;

      if (parsed.type === "user_message_saved") {
        if (parsed.message.metadata?.kickoff === true) return;

        const text = parsed.message.parts.map((part) => part.text).join("");
        setMessages((current) => {
          let replaced = false;
          return current.map((message) => {
            if (!replaced && message.id.startsWith("temp-") && message.role === "user") {
              replaced = true;
              return { id: parsed.message.id, role: "user", content: text };
            }
            return message;
          });
        });
        return;
      }

      if (parsed.type === "text_delta") {
        setAwaitingOpening(false);
        const streamingId = streamingIdRef.current ?? nanoid();
        streamingIdRef.current = streamingId;
        setMessages((current) => {
          const existing = current.find((message) => message.id === streamingId);
          if (existing !== undefined) {
            return current.map((message) =>
              message.id === streamingId
                ? { ...message, content: message.content + parsed.delta }
                : message,
            );
          }
          return [...current, { id: streamingId, role: "assistant", content: parsed.delta }];
        });
        setStatus("streaming");
        return;
      }

      if (parsed.type === "tool_call") {
        setAwaitingOpening(false);
        const streamingId = streamingIdRef.current ?? nanoid();
        streamingIdRef.current = streamingId;
        setMessages((current) =>
          upsertStreamingToolCall(current, streamingId, {
            id: parsed.toolCallId,
            toolName: parsed.toolName,
            input: parsed.input,
            state: "running",
          }),
        );
        setStatus("streaming");
        return;
      }

      if (parsed.type === "tool_result") {
        const streamingId = streamingIdRef.current;
        if (streamingId === null) return;
        setMessages((current) =>
          upsertStreamingToolCall(current, streamingId, {
            id: parsed.toolCallId,
            toolName: parsed.toolName,
            output: parsed.output,
            state: "completed",
          }),
        );
        return;
      }

      if (parsed.type === "tool_error") {
        const streamingId = streamingIdRef.current;
        if (streamingId === null) return;
        setMessages((current) =>
          upsertStreamingToolCall(current, streamingId, {
            id: parsed.toolCallId,
            toolName: parsed.toolName,
            errorText: parsed.errorText,
            state: "error",
          }),
        );
        return;
      }

      if (parsed.type === "assistant_message") {
        setAwaitingOpening(false);
        const text = parsed.message.parts
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("");
        const toolCalls = parsed.message.parts
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
        const streamingId = streamingIdRef.current;
        streamingIdRef.current = null;
        setMessages((current) => {
          const withoutStreaming = streamingId
            ? current.filter((message) => message.id !== streamingId)
            : current;
          return [
            ...withoutStreaming,
            {
              id: parsed.message.id,
              role: "assistant",
              content: text,
              ...(toolCalls.length > 0 ? { toolCalls } : {}),
            },
          ];
        });
        setStatus("ready");
        return;
      }

      if (parsed.type === "belief_flag") {
        beliefsRef.current = [
          ...beliefsRef.current,
          {
            id: nanoid(),
            belief: parsed.belief,
            sourceMessageId: parsed.sourceMessageId,
          },
        ];
        onBeliefsChange(beliefsRef.current);
        return;
      }

      if (parsed.type === "error") {
        streamingIdRef.current = null;
        setAwaitingOpening(false);
        setChatError(parsed.error);
        setStatus("ready");
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [bootstrap, onBeliefsChange]);

  const handleSendMessage = useCallback(
    async (promptMessage: PromptInputMessage) => {
      const text = promptMessage.text.trim();
      if (text.length === 0 || status !== "ready") return;
      if (wsRef.current === null || wsRef.current.readyState !== WebSocket.OPEN) {
        setChatError("Not connected. Refresh to reconnect.");
        return;
      }

      setInput("");
      setChatError(null);
      setStatus("submitted");
      setMessages((current) => [
        ...current,
        { id: `temp-${nanoid()}`, role: "user", content: text },
      ]);
      wsRef.current.send(JSON.stringify({ type: "user_message", text }));
    },
    [status],
  );

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  }, []);

  if (bootstrap === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const showThinking =
    (awaitingOpening && messages.length === 0) || status === "submitted" || status === "streaming";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{bootstrap.session.topic}</p>
        </div>
        {!connected ? <span className="text-xs text-muted-foreground">Connecting…</span> : null}
      </div>

      <Conversation className="flex-1">
        <ConversationContent>
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent data-message-id={message.id}>
                {(message.toolCalls ?? []).map((toolCall) => (
                  <InterviewToolCall key={toolCall.id} toolCall={toolCall} />
                ))}
                {message.role === "assistant" && message.content.length > 0 ? (
                  <MessageResponse>{message.content}</MessageResponse>
                ) : message.role === "user" ? (
                  message.content
                ) : null}
              </MessageContent>
            </Message>
          ))}
          {showThinking && messages.every((message) => message.role !== "assistant") ? (
            <Message from="assistant">
              <MessageContent>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Spinner />
                  Preparing your interview…
                </p>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-4">
        {chatError !== null ? <p className="mb-3 text-sm text-destructive">{chatError}</p> : null}
        <PromptInput className="relative mx-auto w-full max-w-2xl" onSubmit={handleSendMessage}>
          <PromptInputTextarea
            className="min-h-[60px] pr-12"
            disabled={status !== "ready" || !connected}
            onChange={handleTextChange}
            placeholder="Share your thoughts…"
            value={input}
          />
          <PromptInputSubmit
            className="absolute right-1 bottom-1"
            disabled={input.trim().length === 0 || !connected || status !== "ready"}
            status={status}
          />
        </PromptInput>
      </div>
    </div>
  );
}
