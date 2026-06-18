import { useCallback, useState } from "react";

import { InterviewCanvas } from "@/components/exedra/interview-canvas";
import { InterviewChat } from "@/components/interview/interview-chat";
import { ShareSessionDialog } from "@/components/sessions/share-session-dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { BeliefFeedback, BeliefFlag, InterviewBootstrap } from "@/lib/interview-api";
import { patchBeliefFeedback } from "@/lib/interview-api";
import type { SessionDetail } from "@/lib/sessions-api";

import { AppChrome } from "../../shell/app-chrome";
import { useMobileChromeLayout } from "../../shell/mobile-chrome-layout";
import { parseInterviewSessionId } from "../../shell/routes";

import "../../styles/index.css";

function InterviewContent({
  sessionId,
  onNavigate,
  onProfileRefresh,
  sessionDetail,
  loadSessions,
  loadSessionDetail,
}: {
  sessionId: string;
  onNavigate: (path: string) => void;
  onProfileRefresh: () => void;
  sessionDetail: SessionDetail | null;
  loadSessions: () => void;
  loadSessionDetail: (sessionId: string) => void;
}) {
  const [beliefs, setBeliefs] = useState<BeliefFlag[]>([]);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const { canvasOpen, setCanvasOpen, isCompactChrome } = useMobileChromeLayout();

  const handleBootstrap = useCallback((_bootstrap: InterviewBootstrap) => {
    setChatError(null);
  }, []);

  const handleBeliefsChange = useCallback((next: BeliefFlag[]) => {
    setBeliefs((current) => {
      const preserved = new Map(
        current.map((belief) => [
          belief.id,
          { feedback: belief.feedback, correction: belief.correction },
        ]),
      );
      return next.map((belief) => ({
        ...belief,
        ...preserved.get(belief.id),
      }));
    });
  }, []);

  const handleBeliefUpdate = useCallback(
    (id: string, update: { feedback?: BeliefFeedback; correction?: string }) => {
      setBeliefs((current) => {
        const belief = current.find((entry) => entry.id === id);
        if (belief === undefined || update.feedback === undefined) return current;

        void patchBeliefFeedback(sessionId, id, {
          sourceMessageId: belief.sourceMessageId,
          feedback: update.feedback,
          ...(update.correction !== undefined ? { correction: update.correction } : {}),
        }).catch(() => {
          // optimistic UI; reload restores server truth
        });

        return current.map((entry) => (entry.id === id ? { ...entry, ...update } : entry));
      });
    },
    [sessionId],
  );

  const handleBeliefSourceClick = useCallback(
    (sourceMessageId: string) => {
      setScrollToMessageId(sourceMessageId);
      setCanvasOpen(false);
    },
    [setCanvasOpen],
  );

  const handleChatError = useCallback((error: string | null) => {
    setChatError(error);
  }, []);

  const canvasProps = {
    sessionId,
    beliefs,
    sessionDetail,
    onBeliefSourceClick: handleBeliefSourceClick,
    onBeliefUpdate: handleBeliefUpdate,
    onRefreshDetail: () => {
      loadSessionDetail(sessionId);
      loadSessions();
    },
  };

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <InterviewChat
        key={sessionId}
        sessionId={sessionId}
        onBootstrap={handleBootstrap}
        onBeliefsChange={handleBeliefsChange}
        onError={handleChatError}
        onNavigate={onNavigate}
        onOnboardingComplete={onProfileRefresh}
        onScrollToMessageComplete={() => setScrollToMessageId(null)}
        scrollToMessageId={scrollToMessageId}
        canManage={sessionDetail?.canManage}
        onShare={() => setShareOpen(true)}
      />
      {chatError !== null ? (
        <div className="sr-only" aria-live="polite">
          {chatError}
        </div>
      ) : null}
      <InterviewCanvas {...canvasProps} />
      <Sheet open={canvasOpen && isCompactChrome} onOpenChange={setCanvasOpen}>
        <SheetContent side="right" className="w-[min(100%,24rem)] gap-0 p-0 sm:max-w-none">
          <InterviewCanvas {...canvasProps} sheetMode />
        </SheetContent>
      </Sheet>
      <ShareSessionDialog sessionId={sessionId} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}

function InterviewApp() {
  const sessionId = parseInterviewSessionId(window.location.pathname);

  if (sessionId === null) {
    window.location.href = "/";
    return null;
  }

  return (
    <AppChrome entrypoint="interview">
      {(ctx) => <InterviewContent sessionId={sessionId} {...ctx} />}
    </AppChrome>
  );
}

export default InterviewApp;
