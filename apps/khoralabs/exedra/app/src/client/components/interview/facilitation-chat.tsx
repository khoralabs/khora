import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import {
  type ChatMessage,
  type FacilitationBootstrap,
  fetchFacilitation,
  interviewWsUrl,
  uiMessagesToChatMessages,
} from "@/lib/interview-api";
import { InterviewChatInput } from "./interview-chat-input";
import { interviewChatColumnClassName } from "./interview-chat-layout";
import { InterviewChatMessages } from "./interview-chat-messages";
import { closeWebSocket, waitForWebSocketOpen } from "./interview-ws-connection";
import { dispatchWsMessage, parseWsMessage } from "./interview-ws-handlers";

type FacilitationChatProps = {
  sessionId: string;
};

export function FacilitationChat({ sessionId }: FacilitationChatProps) {
  const [bootstrap, setBootstrap] = useState<FacilitationBootstrap | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchFacilitation(sessionId)
      .then((data) => {
        if (cancelled) return;
        setBootstrap(data);
        setMessages(uiMessagesToChatMessages(data.messages));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load facilitation");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (bootstrap === null) return;

    const ws = new WebSocket(interviewWsUrl(bootstrap.wsUrl));
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "client_context" }));
    };
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const parsed = parseWsMessage(String(event.data));
      if (parsed === null) return;
      dispatchWsMessage(parsed, {
        setMessages,
        setStatus: () => {},
        setAwaitingOpening: () => {},
        setChatError: setError,
        streamingIdRef: { current: null },
        beliefsRef: { current: [] },
        agentAuthor: bootstrap.agent,
        onBeliefsChange: () => {},
        shouldAcceptStreamUpdates: () => true,
      });
    };
    wsRef.current = ws;
    return () => {
      closeWebSocket(ws);
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [bootstrap]);

  const submitMessage = useCallback(async () => {
    if (bootstrap === null || !bootstrap.canWrite) return;
    const text = input.trim();
    if (text.length === 0) return;
    setInput("");
    setError(null);
    const ws =
      wsRef.current?.readyState === WebSocket.OPEN
        ? wsRef.current
        : await waitForWebSocketOpen(
            wsRef.current ?? new WebSocket(interviewWsUrl(bootstrap.wsUrl)),
          );
    ws.send(JSON.stringify({ type: "user_message", turnId: nanoid(), text }));
  }, [bootstrap, input]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (bootstrap === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
        {error ?? "Facilitation unavailable"}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-medium">Facilitation</h2>
        <p className="text-xs text-muted-foreground">
          Shared thread for interpreting participant interviews
        </p>
      </div>
      <div className={`mx-auto flex w-full flex-1 flex-col ${interviewChatColumnClassName}`}>
        <InterviewChatMessages
          messages={messages}
          sessionId={sessionId}
          status="ready"
          showAgentLoading={false}
          agentAuthor={bootstrap.agent}
        />
        {bootstrap.canWrite ? (
          <InterviewChatInput
            chatError={error}
            connected={connected}
            input={input}
            onError={setError}
            onStop={() => {}}
            onSubmit={() => void submitMessage()}
            onTextChange={setInput}
            placeholder="Discuss with facilitators…"
            status="ready"
          />
        ) : (
          <div className="border-t px-4 py-3 text-sm text-muted-foreground">
            Read-only facilitation access
          </div>
        )}
      </div>
    </div>
  );
}
