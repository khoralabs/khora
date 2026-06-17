import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import type { BeliefFlag, InterviewBootstrap } from "@/lib/interview-api";
import { interviewWsUrl } from "@/lib/interview-api";
import { getBrowserTimeZone } from "@/lib/user-timezone";

import { closeWebSocket, reconnectDelay, waitForWebSocketOpen } from "./interview-ws-connection";
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
  onResync?: () => void | Promise<void>;
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
  onResync,
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

  const intentionalCloseRef = useRef(false);
  const hadConnectedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectGenerationRef = useRef(0);
  const pingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingPongRef = useRef(false);

  const onBeliefsChangeRef = useRef(onBeliefsChange);
  onBeliefsChangeRef.current = onBeliefsChange;
  const onOnboardingCompleteRef = useRef(onOnboardingComplete);
  onOnboardingCompleteRef.current = onOnboardingComplete;
  const onResyncRef = useRef(onResync);
  onResyncRef.current = onResync;

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

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearPingTimeout = useCallback(() => {
    if (pingTimeoutRef.current !== null) {
      clearTimeout(pingTimeoutRef.current);
      pingTimeoutRef.current = null;
    }
    awaitingPongRef.current = false;
  }, []);

  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      const parsed = parseWsMessage(String(event.data));
      if (parsed === null) return;
      if (parsed.type === "pong") {
        clearPingTimeout();
        return;
      }
      dispatchWsMessage(parsed, wsHandlerContext.current);
    },
    [clearPingTimeout],
  );

  const scheduleReconnect = useCallback(() => {
    if (intentionalCloseRef.current || bootstrapRef.current === null) return;

    clearReconnectTimer();
    const generation = ++reconnectGenerationRef.current;
    const delay = reconnectDelay(reconnectAttemptRef.current);
    reconnectAttemptRef.current += 1;

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (generation !== reconnectGenerationRef.current) return;
      if (intentionalCloseRef.current || bootstrapRef.current === null) return;

      const current = wsRef.current;
      if (current?.readyState === WebSocket.OPEN || current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      connectWebSocketRef.current();
    }, delay);
  }, [clearReconnectTimer]);

  const connectWebSocketRef = useRef<() => WebSocket>(() => {
    throw new Error("Not connected");
  });

  connectWebSocketRef.current = (): WebSocket => {
    const data = bootstrapRef.current;
    if (data === null) throw new Error("Not connected");

    closeWebSocket(wsRef.current);

    const ws = new WebSocket(interviewWsUrl(data.wsUrl));
    ws.onopen = () => {
      const isReconnect = hadConnectedRef.current;
      hadConnectedRef.current = true;
      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
      clearPingTimeout();
      setConnected(true);
      setChatError(null);
      ws.send(JSON.stringify({ type: "client_context", timeZone: getBrowserTimeZone() }));

      if (isReconnect) {
        streamingIdRef.current = null;
        sessionRefs.clearPendingDraft();
        void onResyncRef.current?.();
      }
    };
    ws.onclose = () => {
      setConnected(false);
      if (!intentionalCloseRef.current) {
        scheduleReconnect();
      }
    };
    ws.onmessage = handleWsMessage;
    wsRef.current = ws;
    return ws;
  };

  const connectWebSocket = useCallback((): WebSocket => connectWebSocketRef.current(), []);

  const forceConnectOnTabActive = useCallback(() => {
    if (intentionalCloseRef.current || bootstrapRef.current === null) return;
    if (document.visibilityState !== "visible") return;

    reconnectAttemptRef.current = 0;
    clearReconnectTimer();

    const current = wsRef.current;
    if (current?.readyState === WebSocket.CONNECTING) return;

    if (current?.readyState === WebSocket.OPEN) {
      if (awaitingPongRef.current) return;
      awaitingPongRef.current = true;
      current.send(JSON.stringify({ type: "ping" }));
      pingTimeoutRef.current = setTimeout(() => {
        awaitingPongRef.current = false;
        pingTimeoutRef.current = null;
        closeWebSocket(wsRef.current);
        wsRef.current = null;
        connectWebSocketRef.current();
      }, 3_000);
      return;
    }

    connectWebSocketRef.current();
  }, [clearReconnectTimer]);

  const ensureWebSocketOpen = useCallback(async (): Promise<WebSocket> => {
    const current = wsRef.current;
    if (current?.readyState === WebSocket.OPEN) return current;
    if (current?.readyState === WebSocket.CONNECTING) return waitForWebSocketOpen(current);
    return waitForWebSocketOpen(connectWebSocket());
  }, [connectWebSocket]);

  useEffect(() => {
    if (bootstrap === null) return;

    intentionalCloseRef.current = false;
    hadConnectedRef.current = false;
    reconnectAttemptRef.current = 0;
    reconnectGenerationRef.current += 1;
    clearReconnectTimer();

    const ws = connectWebSocket();
    return () => {
      intentionalCloseRef.current = true;
      reconnectGenerationRef.current += 1;
      clearReconnectTimer();
      clearPingTimeout();
      closeWebSocket(ws);
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [bootstrap, connectWebSocket, clearReconnectTimer, clearPingTimeout]);

  useEffect(() => {
    function onTabActive() {
      forceConnectOnTabActive();
    }

    function onOnline() {
      forceConnectOnTabActive();
    }

    window.addEventListener("focus", onTabActive);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onTabActive);
    window.addEventListener("pageshow", onTabActive);
    return () => {
      window.removeEventListener("focus", onTabActive);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onTabActive);
      window.removeEventListener("pageshow", onTabActive);
      clearPingTimeout();
    };
  }, [forceConnectOnTabActive, clearPingTimeout]);

  return {
    connected,
    chatError,
    setChatError,
    streamingIdRef,
    ensureWebSocketOpen,
  };
}
