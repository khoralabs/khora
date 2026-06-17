import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { InterviewChatDropOverlay } from "./interview-chat-drop-overlay";
import { InterviewChatHeader } from "./interview-chat-header";
import { InterviewChatInput } from "./interview-chat-input";
import { InterviewChatMessages, interviewShowThinking } from "./interview-chat-messages";
import type { InterviewChatProps } from "./interview-chat-types";
import { useInterviewBootstrap } from "./use-interview-bootstrap";
import { useInterviewDragDrop } from "./use-interview-drag-drop";
import { useInterviewSendMessage } from "./use-interview-send-message";
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
  } = useInterviewBootstrap({ sessionId, onBootstrap, onBeliefsChange, onError });

  const { connected, chatError, setChatError, streamingIdRef, ensureWebSocketOpen } =
    useInterviewWs({
      bootstrap,
      beliefsRef,
      onBeliefsChange,
      onOnboardingComplete,
      setMessages,
      setStatus,
      setAwaitingOpening,
    });

  const canAcceptFiles = status === "ready" && connected;
  const { chatRootRef, isDragActive, handleAttachmentAddReady } =
    useInterviewDragDrop(canAcceptFiles);

  useScrollToMessage(scrollToMessageId, onScrollToMessageComplete);

  const { input, handleSendMessage, handleTextChange } = useInterviewSendMessage({
    sessionId,
    status,
    setStatus,
    setMessages,
    setChatError,
    streamingIdRef,
    ensureWebSocketOpen,
  });

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
        onAttachmentAddReady={handleAttachmentAddReady}
        onError={setChatError}
        onSubmit={handleSendMessage}
        onTextChange={handleTextChange}
        status={status}
      />
    </div>
  );
}
