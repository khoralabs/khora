import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";

import { InterviewChatHeader } from "./interview-chat-header";
import type { InterviewChatProps } from "./interview-chat-types";
import { FacilitationThreadPanel, InterviewThreadPanel } from "./thread-chat-panel";
import type { ThreadKind } from "./thread-chat-types";

type SessionChatProps = InterviewChatProps & {
  canFacilitate?: boolean;
  canParticipate?: boolean;
  sessionTopic: string;
  activeThread?: ThreadKind;
  onActiveThreadChange?: (thread: ThreadKind) => void;
  optInLoading?: boolean;
  onOptIn?: () => void;
};

export function SessionChat({
  sessionId,
  sessionTopic,
  canFacilitate = false,
  canParticipate = false,
  activeThread: activeThreadProp,
  onActiveThreadChange,
  optInLoading = false,
  onOptIn,
  onBootstrap,
  onBeliefsChange,
  onError,
  onNavigate,
  onSessionComplete,
  scrollToTarget,
  onScrollToMessageComplete,
  canManage,
  onShare,
  onTopicChange,
  sessionComplete = false,
  onChatDocumentsChange,
}: SessionChatProps) {
  const showFacilitationTab = canFacilitate;
  const showInterviewTab = canFacilitate || canParticipate;
  const defaultThread: ThreadKind = canFacilitate ? "facilitation" : "interview";

  const [activeThreadState, setActiveThreadState] = useState<ThreadKind>(defaultThread);
  const activeThread = activeThreadProp ?? activeThreadState;
  const setActiveThread = onActiveThreadChange ?? setActiveThreadState;
  const [connected, setConnected] = useState(false);

  const handleThreadChange = useCallback(
    (thread: ThreadKind) => {
      setConnected(false);
      setActiveThread(thread);
    },
    [setActiveThread],
  );

  const showInterviewOptIn =
    activeThread === "interview" && canFacilitate && !canParticipate && onOptIn !== undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <InterviewChatHeader
        activeThread={activeThread}
        canManage={canManage}
        connected={connected}
        onActiveThreadChange={handleThreadChange}
        onNavigate={onNavigate}
        onShare={onShare}
        onTopicChange={onTopicChange}
        sessionId={sessionId}
        sessionTopic={sessionTopic}
        showFacilitationTab={showFacilitationTab}
        showInterviewTab={showInterviewTab}
      />

      {showInterviewOptIn ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="space-y-2">
            <h2 className="text-base font-medium">Start your interview</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Opt in to participate in this session&apos;s individual interview phase.
            </p>
          </div>
          <Button type="button" disabled={optInLoading} onClick={onOptIn}>
            {optInLoading ? "Starting…" : "Start my interview"}
          </Button>
        </div>
      ) : activeThread === "facilitation" && canFacilitate ? (
        <FacilitationThreadPanel
          key="facilitation"
          sessionId={sessionId}
          onConnectedChange={setConnected}
          onError={onError}
        />
      ) : (
        <InterviewThreadPanel
          key={`interview-${sessionId}`}
          sessionComplete={sessionComplete}
          sessionId={sessionId}
          onBeliefsChange={onBeliefsChange}
          onBootstrap={onBootstrap}
          onChatDocumentsChange={onChatDocumentsChange}
          onConnectedChange={setConnected}
          onError={onError}
          onScrollToMessageComplete={onScrollToMessageComplete}
          onSessionComplete={onSessionComplete}
          scrollToTarget={scrollToTarget}
        />
      )}
    </div>
  );
}
