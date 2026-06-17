import { useRef } from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { InterviewChatDropOverlay } from "./interview-chat-drop-overlay";
import { InterviewChatHeader } from "./interview-chat-header";
import { InterviewChatInput } from "./interview-chat-input";
import { InterviewChatMessages, interviewShowThinking } from "./interview-chat-messages";
import type { InterviewChatProps } from "./interview-chat-types";
import { useInterviewBootstrap } from "./use-interview-bootstrap";
import { useInterviewDragDrop } from "./use-interview-drag-drop";
import { useInterviewTurn } from "./use-interview-turn";
import { useInterviewWs } from "./use-interview-ws";
import { useScrollToMessage } from "./use-scroll-to-message";

export function InterviewChat({
  sessionId,
  onBootstrap,
  onBeliefsChange,
  onError,
  onNavigate,
  onOnboardingComplete,
  scrollToMessageId,
  onScrollToMessageComplete,
}: InterviewChatProps) {
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
    onOnboardingComplete,
    onResync: resyncFromServer,
    setMessages,
    setStatus,
    setAwaitingOpening,
    sessionRefs,
    streamingIdRef,
  });

  ensureWebSocketOpenRef.current = ensureWebSocketOpen;
  setChatErrorRef.current = setChatError;

  useScrollToMessage(scrollToMessageId, onScrollToMessageComplete);

  if (bootstrap === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div
      className={cn("relative flex min-w-0 flex-1 flex-col", isDragActive && "select-none")}
      ref={chatRootRef}
    >
      <InterviewChatDropOverlay active={isDragActive} />
      <InterviewChatHeader
        bootstrap={bootstrap}
        connected={connected}
        onNavigate={onNavigate}
        sessionId={sessionId}
      />
      <InterviewChatMessages
        messages={messages}
        sessionId={sessionId}
        showThinking={interviewShowThinking(awaitingOpening, messages, status)}
      />
      <InterviewChatInput
        chatError={chatError}
        connected={connected}
        input={input}
        onAttachmentControlsReady={handleAttachmentControlsReady}
        onError={setChatError}
        onStop={stopTurn}
        onSubmit={submitTurn}
        onTextChange={handleTextChange}
        status={status}
      />
    </div>
  );
}
