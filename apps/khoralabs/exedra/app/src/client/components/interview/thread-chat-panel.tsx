import { ChatFrameworkThreadPanel } from "./chat-framework-thread-panel";
import type { InterviewChatProps } from "./interview-chat-types";

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
  onError,
  sessionComplete = false,
  onConnectedChange,
  ..._legacyCallbacks
}: InterviewThreadPanelProps) {
  return (
    <ChatFrameworkThreadPanel
      canWrite={!sessionComplete}
      kind="interview"
      sessionId={sessionId}
      onConnectedChange={onConnectedChange}
      onError={onError}
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
  return (
    <ChatFrameworkThreadPanel
      canWrite
      kind="facilitation"
      sessionId={sessionId}
      onConnectedChange={onConnectedChange}
      onError={onError}
    />
  );
}
