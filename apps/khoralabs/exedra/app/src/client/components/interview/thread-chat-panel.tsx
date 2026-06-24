import type { ReactNode } from "react";

import { ChatFrameworkThreadPanel } from "./chat-framework-thread-panel";

type InterviewThreadPanelProps = {
  sessionId: string;
  onError: (error: string | null) => void;
  sessionComplete?: boolean;
  onConnectedChange?: (connected: boolean) => void;
  composerHeader?: ReactNode;
};

export function InterviewThreadPanel({
  sessionId,
  onError,
  sessionComplete = false,
  onConnectedChange,
  composerHeader,
}: InterviewThreadPanelProps) {
  return (
    <ChatFrameworkThreadPanel
      canWrite={!sessionComplete}
      composerHeader={composerHeader}
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
  composerHeader,
}: {
  sessionId: string;
  onError: (error: string | null) => void;
  onConnectedChange?: (connected: boolean) => void;
  composerHeader?: ReactNode;
}) {
  return (
    <ChatFrameworkThreadPanel
      canWrite
      composerHeader={composerHeader}
      kind="facilitation"
      sessionId={sessionId}
      onConnectedChange={onConnectedChange}
      onError={onError}
    />
  );
}
