import { useEffect, useRef, useState } from "react";

import type { ChatStatus } from "ai";
import { Spinner } from "@/components/ui/spinner";
import { extractChatDocuments, type InterviewBootstrap } from "@/lib/interview-api";

import type { InterviewChatProps } from "./interview-chat-types";
import { ThreadChatView } from "./thread-chat-view";
import { useFacilitationBootstrap } from "./use-facilitation-bootstrap";
import { useFacilitationTurn } from "./use-facilitation-turn";
import { useInterviewBootstrap } from "./use-interview-bootstrap";
import { useInterviewDragDrop } from "./use-interview-drag-drop";
import { useInterviewTurn } from "./use-interview-turn";
import { useInterviewWs } from "./use-interview-ws";
import { useScrollToMessage } from "./use-scroll-to-message";

type InterviewThreadPanelProps = Pick<
  InterviewChatProps,
  | "sessionId"
  | "onBootstrap"
  | "onBeliefsChange"
  | "onError"
  | "onSessionComplete"
  | "scrollToTarget"
  | "onScrollToMessageComplete"
  | "sessionComplete"
  | "onChatDocumentsChange"
> & {
  onConnectedChange?: (connected: boolean) => void;
};

export function InterviewThreadPanel({
  sessionId,
  onBootstrap,
  onBeliefsChange,
  onError,
  onSessionComplete,
  scrollToTarget,
  onScrollToMessageComplete,
  sessionComplete = false,
  onChatDocumentsChange,
  onConnectedChange,
}: InterviewThreadPanelProps) {
  const {
    bootstrap,
    messages,
    setMessages,
    status,
    setStatus,
    awaitingOpening,
    setAwaitingOpening,
    beliefsRef,
    resyncFromServer,
  } = useInterviewBootstrap({ sessionId, onBootstrap, onBeliefsChange, onError });

  const streamingIdRef = useRef<string | null>(null);
  const ensureWebSocketOpenRef = useRef<() => Promise<WebSocket>>(() =>
    Promise.reject(new Error("Not connected")),
  );
  const setChatErrorRef = useRef<(error: string | null) => void>(() => {});

  const { chatRootRef, isDragActive, attachmentControlsRef, handleAttachmentControlsReady } =
    useInterviewDragDrop(status === "ready");

  const { input, submitTurn, stopTurn, handleTextChange, sessionRefs } = useInterviewTurn({
    sessionId,
    status,
    viewerAuthor: bootstrap?.viewer ?? null,
    setStatus,
    setMessages,
    setChatError: (error) => setChatErrorRef.current(error),
    streamingIdRef,
    ensureWebSocketOpen: () => ensureWebSocketOpenRef.current(),
    attachmentControlsRef,
    beliefsRef,
    onBeliefsChange,
  });

  const { connected, chatError, setChatError, ensureWebSocketOpen } = useInterviewWs({
    bootstrap,
    beliefsRef,
    onBeliefsChange,
    onSessionComplete,
    onResync: resyncFromServer,
    setMessages,
    setStatus,
    setAwaitingOpening,
    sessionRefs,
    streamingIdRef,
  });

  ensureWebSocketOpenRef.current = ensureWebSocketOpen;
  setChatErrorRef.current = setChatError;

  useEffect(() => {
    onConnectedChange?.(connected);
  }, [connected, onConnectedChange]);

  useScrollToMessage(scrollToTarget, onScrollToMessageComplete, bootstrap !== null);

  useEffect(() => {
    onChatDocumentsChange?.(extractChatDocuments(messages));
  }, [messages, onChatDocumentsChange]);

  if (bootstrap === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <ThreadChatView
      agentAuthor={bootstrap.agent}
      awaitingOpening={awaitingOpening}
      canWrite={bootstrap.canWriteInterview !== false}
      chatError={chatError}
      chatRootRef={chatRootRef}
      connected={connected}
      input={input}
      isDragActive={isDragActive}
      messages={messages}
      onAttachmentControlsReady={handleAttachmentControlsReady}
      onError={setChatError}
      onStop={stopTurn}
      onSubmit={submitTurn}
      onTextChange={handleTextChange}
      placeholder={
        sessionComplete ? "Review beliefs or ask a follow-up…" : "Share your thoughts…"
      }
      readOnlyMessage="Read-only interview access"
      sessionId={sessionId}
      status={status}
    />
  );
}

export function FacilitationThreadPanel({
  sessionId,
  onError,
  onConnectedChange,
}: {
  sessionId: string;
  onError: (error: string | null) => void;
  onConnectedChange?: (connected: boolean) => void;
}) {
  const { bootstrap, messages, setMessages, status, resyncFromServer } = useFacilitationBootstrap({
    sessionId,
    enabled: true,
    onError,
  });

  const streamingIdRef = useRef<string | null>(null);
  const beliefsRef = useRef<never[]>([]);
  const [, setStatus] = useState<ChatStatus>("ready");
  const [, setAwaitingOpening] = useState(false);

  const ensureWebSocketOpenRef = useRef<() => Promise<WebSocket>>(() =>
    Promise.reject(new Error("Not connected")),
  );

  const { chatRootRef, isDragActive, handleAttachmentControlsReady } = useInterviewDragDrop(true);

  const { input, submitTurn, stopTurn, handleTextChange, sessionRefs } = useFacilitationTurn({
    canWrite: bootstrap?.canWrite === true,
    viewerAuthor: bootstrap?.viewer ?? null,
    setMessages,
    setChatError: onError,
    ensureWebSocketOpen: () => ensureWebSocketOpenRef.current(),
  });

  const interviewBootstrap: InterviewBootstrap | null =
    bootstrap === null
      ? null
      : {
          session: bootstrap.session,
          threadId: bootstrap.threadId,
          wsUrl: bootstrap.wsUrl,
          messages: bootstrap.messages,
          agent: bootstrap.agent,
          viewer: bootstrap.viewer,
          canWriteInterview: bootstrap.canWrite,
        };

  const { connected, chatError, setChatError, ensureWebSocketOpen } = useInterviewWs({
    bootstrap: interviewBootstrap,
    beliefsRef,
    onBeliefsChange: () => {},
    setMessages,
    setStatus,
    setAwaitingOpening,
    sessionRefs,
    streamingIdRef,
    onResync: resyncFromServer,
  });

  ensureWebSocketOpenRef.current = ensureWebSocketOpen;

  useEffect(() => {
    onConnectedChange?.(connected);
  }, [connected, onConnectedChange]);

  if (bootstrap === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <ThreadChatView
      agentAuthor={bootstrap.agent}
      canWrite={bootstrap.canWrite}
      chatError={chatError}
      chatRootRef={chatRootRef}
      connected={connected}
      input={input}
      isDragActive={isDragActive}
      messages={messages}
      onAttachmentControlsReady={handleAttachmentControlsReady}
      onError={setChatError}
      onStop={stopTurn}
      onSubmit={submitTurn}
      onTextChange={handleTextChange}
      placeholder="Discuss with facilitators… @agent to invoke"
      readOnlyMessage="Read-only facilitation access"
      sessionId={sessionId}
      showAgentLoading={false}
      status={status}
    />
  );
}
