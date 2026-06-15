import type { ChatStatus } from "ai";
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
import { Spinner } from "@/components/ui/spinner";
import {
  type BeliefFlag,
  type ChatMessage,
  extractBeliefsFromMessages,
  fetchInterview,
  type InterviewBootstrap,
  interviewWsUrl,
  uiMessagesToChatMessages,
} from "@/lib/interview-api";

type InterviewChatProps = {
  sessionId: string;
  onBootstrap: (bootstrap: InterviewBootstrap) => void;
  onBeliefsChange: (beliefs: BeliefFlag[]) => void;
  onError: (error: string | null) => void;
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
      message: { id: string; role: "assistant"; parts: { type: "text"; text: string }[] };
    }
  | { type: "belief_flag"; belief: string; sourceMessageId: string }
  | { type: "error"; error: string }
  | { type: "pong" };

export function InterviewChat({
  sessionId,
  onBootstrap,
  onBeliefsChange,
  onError,
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

      if (parsed.type === "assistant_message") {
        setAwaitingOpening(false);
        const text = parsed.message.parts.map((part) => part.text).join("");
        const streamingId = streamingIdRef.current;
        streamingIdRef.current = null;
        setMessages((current) => {
          const withoutStreaming = streamingId
            ? current.filter((message) => message.id !== streamingId)
            : current;
          return [...withoutStreaming, { id: parsed.message.id, role: "assistant", content: text }];
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
              <MessageContent>
                {message.role === "assistant" ? (
                  <MessageResponse>{message.content}</MessageResponse>
                ) : (
                  message.content
                )}
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
