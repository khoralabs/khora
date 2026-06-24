import { ArrowLeftIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  onError,
  onNavigate,
  canManage,
  onShare,
  onTopicChange,
  sessionComplete = false,
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
  const showThreadSelector = showFacilitationTab && showInterviewTab && !showInterviewOptIn;
  const threadSelector = showThreadSelector ? (
    <Tabs value={activeThread} onValueChange={(value) => handleThreadChange(value as ThreadKind)}>
      <TabsList className="bg-background">
        <TabsTrigger value="facilitation" className="text-xs font-medium">
          Facilitation
        </TabsTrigger>
        <TabsTrigger value="interview" className="text-xs font-medium">
          My interview
        </TabsTrigger>
      </TabsList>
    </Tabs>
  ) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <InterviewChatHeader
        canManage={canManage}
        connected={connected}
        onNavigate={onNavigate}
        onShare={onShare}
        onTopicChange={onTopicChange}
        sessionId={sessionId}
        sessionTopic={sessionTopic}
      />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {showInterviewOptIn ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="space-y-2">
              <h2 className="text-base font-medium">Start your interview</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Opt in to participate in this session&apos;s individual interview phase.
              </p>
            </div>
            <Button type="button" disabled={optInLoading} onClick={onOptIn}>
              {optInLoading ? "Starting…" : "Start my interview"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={optInLoading}
              onClick={() => handleThreadChange("facilitation")}
            >
              <ArrowLeftIcon /> Facilitator thread
            </Button>
          </div>
        ) : activeThread === "facilitation" && canFacilitate ? (
          <FacilitationThreadPanel
            key="facilitation"
            composerHeader={threadSelector}
            sessionId={sessionId}
            onConnectedChange={setConnected}
            onError={onError}
          />
        ) : (
          <InterviewThreadPanel
            key={`interview-${sessionId}`}
            composerHeader={threadSelector}
            sessionComplete={sessionComplete}
            sessionId={sessionId}
            onConnectedChange={setConnected}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
}
