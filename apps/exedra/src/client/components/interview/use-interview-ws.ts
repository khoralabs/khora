import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import type { BeliefFlag, InterviewBootstrap } from "@/lib/interview-api";
import { interviewWsUrl } from "@/lib/interview-api";
import { getBrowserTimeZone } from "@/lib/user-timezone";

import { closeWebSocket, waitForWebSocketOpen } from "./interview-ws-connection";
import {
  dispatchWsMessage,
  type InterviewWsHandlerContext,
  parseWsMessage,
} from "./interview-ws-handlers";

import type { InterviewTurnSessionRefs } from "./use-interview-turn";

type UseInterviewWsArgs = {
  bootstrap: InterviewBootstrap | null;
  beliefsRef: RefObject<BeliefFlag[]>;
  onBeliefsChange: (beliefs: BeliefFlag[]) => void;
  onOnboardingComplete?: () => void;
  setMessages: InterviewWsHandlerContext["setMessages"];
  setStatus: InterviewWsHandlerContext["setStatus"];
  setAwaitingOpening: InterviewWsHandlerContext["setAwaitingOpening"];
  sessionRefs: InterviewTurnSessionRefs;
  streamingIdRef: RefObject<string | null>;
};

export function useInterviewWs({
  bootstrap,
  beliefsRef,
  onBeliefsChange,
  onOnboardingComplete,
  setMessages,
  setStatus,
  setAwaitingOpening,
  sessionRefs,
  streamingIdRef,
}: UseInterviewWsArgs) {
  const [connected, setConnected] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const bootstrapRef = useRef<InterviewBootstrap | null>(null);
  bootstrapRef.current = bootstrap;

  const onBeliefsChangeRef = useRef(onBeliefsChange);
  onBeliefsChangeRef.current = onBeliefsChange;
  const onOnboardingCompleteRef = useRef(onOnboardingComplete);
  onOnboardingCompleteRef.current = onOnboardingComplete;

  const wsHandlerContext = useRef<InterviewWsHandlerContext>({
    setMessages,
    setStatus,
    setAwaitingOpening,
    setChatError,
    streamingIdRef,
    beliefsRef,
    onBeliefsChange: (beliefs) => onBeliefsChangeRef.current(beliefs),
    onOnboardingComplete: () => onOnboardingCompleteRef.current?.(),
    shouldAcceptStreamUpdates: () =>
      sessionRefs.abortedGenerationRef.current !== sessionRefs.sendGenerationRef.current,
    onTurnComplete: () => sessionRefs.clearPendingDraft(),
    onTurnAborted: (turnId) => sessionRefs.onTurnAborted(turnId),
  });
  wsHandlerContext.current.setMessages = setMessages;
  wsHandlerContext.current.setStatus = setStatus;
  wsHandlerContext.current.setAwaitingOpening = setAwaitingOpening;
  wsHandlerContext.current.setChatError = setChatError;
  wsHandlerContext.current.streamingIdRef = streamingIdRef;
  wsHandlerContext.current.beliefsRef = beliefsRef;
  wsHandlerContext.current.shouldAcceptStreamUpdates = () =>
    sessionRefs.abortedGenerationRef.current !== sessionRefs.sendGenerationRef.current;
  wsHandlerContext.current.onTurnComplete = () => sessionRefs.clearPendingDraft();
  wsHandlerContext.current.onTurnAborted = (turnId) => sessionRefs.onTurnAborted(turnId);

  const handleWsMessage = useCallback((event: MessageEvent) => {
    const parsed = parseWsMessage(String(event.data));
    if (parsed === null) return;
    dispatchWsMessage(parsed, wsHandlerContext.current);
  }, []);

  const connectWebSocket = useCallback((): WebSocket => {
    const data = bootstrapRef.current;
    if (data === null) throw new Error("Not connected");

    closeWebSocket(wsRef.current);

    const ws = new WebSocket(interviewWsUrl(data.wsUrl));
    ws.onopen = () => {
      setConnected(true);
      setChatError(null);
      ws.send(JSON.stringify({ type: "client_context", timeZone: getBrowserTimeZone() }));
    };
    ws.onclose = () => setConnected(false);
    ws.onmessage = handleWsMessage;
    wsRef.current = ws;
    return ws;
  }, [handleWsMessage]);

  const ensureWebSocketOpen = useCallback(async (): Promise<WebSocket> => {
    const current = wsRef.current;
    if (current?.readyState === WebSocket.OPEN) return current;
    if (current?.readyState === WebSocket.CONNECTING) return waitForWebSocketOpen(current);
    return waitForWebSocketOpen(connectWebSocket());
  }, [connectWebSocket]);

  useEffect(() => {
    if (bootstrap === null) return;

    const ws = connectWebSocket();
    return () => {
      closeWebSocket(ws);
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [bootstrap, connectWebSocket]);

  return {
    connected,
    chatError,
    setChatError,
    streamingIdRef,
    ensureWebSocketOpen,
  };
}
