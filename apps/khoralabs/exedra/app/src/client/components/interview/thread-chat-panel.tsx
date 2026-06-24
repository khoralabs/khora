import { ChatFrameworkThreadPanel } from "./chat-framework-thread-panel";

type InterviewThreadPanelProps = {
  sessionId: string;
  onError: (error: string | null) => void;
  sessionComplete?: boolean;
  onConnectedChange?: (connected: boolean) => void;
};

export function InterviewThreadPanel({
  sessionId,
  onError,
  sessionComplete = false,
  onConnectedChange,
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
