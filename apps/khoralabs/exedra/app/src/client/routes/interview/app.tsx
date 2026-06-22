import type { AccountProfile } from "@shared/accounts/row";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { InterviewCanvas } from "@/components/exedra/interview-canvas";
import { FacilitationChat } from "@/components/interview/facilitation-chat";
import { InterviewChat } from "@/components/interview/interview-chat";
import type { SessionCompletePayload } from "@/components/interview/interview-chat-types";
import { ParticipantInterviewViewer } from "@/components/interview/participant-interview-viewer";
import type { InterviewScrollTarget } from "@/components/interview/use-scroll-to-message";
import { ShareSessionDialog } from "@/components/sessions/share-session-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AnalyticsProvider, useAnalytics } from "@/lib/analytics";
import type {
  BeliefFeedback,
  BeliefFlag,
  ChatDocument,
  InterviewBootstrap,
  InterviewCompletion,
} from "@/lib/interview-api";
import {
  extractCompletionFromMessages,
  normalizeInterviewCompletion,
  normalizeNextSessionOptions,
  optInInterview,
  patchBeliefFeedback,
} from "@/lib/interview-api";
import type { SessionDetail } from "@/lib/sessions-api";

import { AppChrome } from "../../shell/app-chrome";
import { useMobileChromeLayout } from "../../shell/mobile-chrome-layout";
import { parseInterviewSessionId } from "../../shell/routes";

import "../../styles/index.css";

type ChatMode = "facilitation" | "mine" | "participant";

function InterviewContent({
  sessionId,
  onNavigate,
  onProfileRefresh,
  sessionDetail,
  activeTeam,
  loadSessions,
  loadSessionDetail,
}: {
  sessionId: string;
  onNavigate: (path: string) => void;
  onProfileRefresh: () => void;
  sessionDetail: SessionDetail | null;
  activeTeam: { id: string };
  loadSessions: () => void;
  loadSessionDetail: (sessionId: string) => void;
}) {
  const track = useAnalytics();
  const canFacilitate = sessionDetail?.canFacilitate === true;
  const canParticipate = sessionDetail?.canParticipate === true;
  const [chatMode, setChatMode] = useState<ChatMode>(canFacilitate ? "facilitation" : "mine");
  const [optInVersion, setOptInVersion] = useState(0);
  const [optInLoading, setOptInLoading] = useState(false);
  const [beliefs, setBeliefs] = useState<BeliefFlag[]>([]);
  const [completion, setCompletion] = useState<InterviewCompletion | null>(null);
  const [scrollToTarget, setScrollToTarget] = useState<InterviewScrollTarget | null>(null);
  const [chatDocuments, setChatDocuments] = useState<ChatDocument[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [viewingParticipant, setViewingParticipant] = useState<AccountProfile | null>(null);
  const { canvasOpen, setCanvasOpen, isCompactChrome } = useMobileChromeLayout();

  useEffect(() => {
    if (canFacilitate) {
      setChatMode((current) => (current === "mine" && !canParticipate ? "facilitation" : current));
    }
  }, [canFacilitate, canParticipate]);

  const showFacilitationTab = canFacilitate;
  const showMineTab = canFacilitate || canParticipate;

  const handleBootstrap = useCallback((bootstrap: InterviewBootstrap) => {
    setChatError(null);
    setCompletion(
      normalizeInterviewCompletion(bootstrap.completion) ??
        extractCompletionFromMessages(bootstrap.messages),
    );
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

        if (update.feedback === "confirmed") {
          track("belief_confirmed", { feedback: "confirmed" });
        } else if (update.feedback === "corrected") {
          track("belief_corrected", { feedback: "corrected" });
        }

        void patchBeliefFeedback(sessionId, id, {
          sourceMessageId: belief.sourceMessageId,
          belief: belief.belief,
          feedback: update.feedback,
          ...(update.correction !== undefined ? { correction: update.correction } : {}),
        }).catch(() => {});

        return current.map((entry) => (entry.id === id ? { ...entry, ...update } : entry));
      });
    },
    [sessionId, track],
  );

  const handleSessionComplete = useCallback(
    (payload: SessionCompletePayload) => {
      setCompletion({
        completedAtMs: Date.now(),
        summary: payload.summary,
        nextSessionOptions: normalizeNextSessionOptions(payload.nextSessionOptions),
      });
      if (payload.sessionKind === "onboarding") {
        track("onboarding_interview_completed");
        onProfileRefresh();
      }
      loadSessions();
    },
    [loadSessions, onProfileRefresh, track],
  );

  const handleBeliefSourceClick = useCallback(
    (sourceMessageId: string) => {
      setScrollToTarget({ messageId: sourceMessageId });
      setCanvasOpen(false);
    },
    [setCanvasOpen],
  );

  const handleDocumentClick = useCallback(
    (messageId: string, documentId: string) => {
      setScrollToTarget({ messageId, attachmentId: documentId });
      setCanvasOpen(false);
    },
    [setCanvasOpen],
  );

  const handleChatDocumentsChange = useCallback((documents: ChatDocument[]) => {
    setChatDocuments(documents);
  }, []);

  const handleChatError = useCallback((error: string | null) => {
    setChatError(error);
  }, []);

  const handleParticipantLoaded = useCallback(
    (data: { beliefs: BeliefFlag[]; completion: InterviewCompletion | null }) => {
      setBeliefs(data.beliefs);
      if (data.completion !== null) {
        setCompletion(data.completion);
      }
    },
    [],
  );

  const handleViewParticipantChat = useCallback((participant: AccountProfile) => {
    setViewingParticipant(participant);
    setChatDocuments([]);
    setChatMode("participant");
  }, []);

  const handleBackFromParticipantChat = useCallback(() => {
    setViewingParticipant(null);
    setBeliefs([]);
    setCompletion(null);
    setChatDocuments([]);
    setChatMode(canFacilitate ? "facilitation" : "mine");
  }, [canFacilitate]);

  const handleOptIn = useCallback(async () => {
    setOptInLoading(true);
    setChatError(null);
    try {
      await optInInterview(sessionId);
      setOptInVersion((value) => value + 1);
      loadSessionDetail(sessionId);
      setChatMode("mine");
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to start interview");
    } finally {
      setOptInLoading(false);
    }
  }, [loadSessionDetail, sessionId]);

  const hideBeliefsOnCanvas = chatMode === "facilitation" && viewingParticipant === null;

  const canvasProps = {
    sessionId,
    teamId: activeTeam.id.length > 0 ? activeTeam.id : (sessionDetail?.session.teamId ?? null),
    beliefs: hideBeliefsOnCanvas ? [] : beliefs,
    completion: chatMode === "facilitation" ? null : completion,
    sessionDetail,
    onBeliefSourceClick: handleBeliefSourceClick,
    onBeliefUpdate: handleBeliefUpdate,
    onNavigate,
    onRefreshDetail: () => {
      loadSessionDetail(sessionId);
      loadSessions();
    },
    canViewParticipantChats: sessionDetail?.canManage === true,
    viewingParticipantUserId: viewingParticipant?.userId ?? null,
    onViewParticipantChat: handleViewParticipantChat,
    onReturnToOwnInterview: handleBackFromParticipantChat,
    beliefsReadOnly: viewingParticipant !== null,
    chatDocuments: chatMode === "facilitation" ? [] : chatDocuments,
    onDocumentClick: handleDocumentClick,
  };

  const modeTabs = useMemo(
    () => (
      <div className="flex items-center gap-2 border-b px-4 py-2">
        {showFacilitationTab ? (
          <Button
            type="button"
            size="sm"
            variant={chatMode === "facilitation" ? "default" : "ghost"}
            onClick={() => {
              setViewingParticipant(null);
              setChatMode("facilitation");
            }}
          >
            Facilitation
          </Button>
        ) : null}
        {showMineTab ? (
          <Button
            type="button"
            size="sm"
            variant={chatMode === "mine" ? "default" : "ghost"}
            onClick={() => {
              setViewingParticipant(null);
              setChatMode("mine");
            }}
          >
            My interview
          </Button>
        ) : null}
      </div>
    ),
    [chatMode, showFacilitationTab, showMineTab],
  );

  let mainPanel: ReactNode;
  if (viewingParticipant !== null || chatMode === "participant") {
    mainPanel =
      viewingParticipant !== null ? (
        <ParticipantInterviewViewer
          sessionId={sessionId}
          participant={viewingParticipant}
          onBack={handleBackFromParticipantChat}
          onNavigate={onNavigate}
          scrollToTarget={scrollToTarget}
          onScrollToMessageComplete={() => setScrollToTarget(null)}
          onLoaded={handleParticipantLoaded}
          onChatDocumentsChange={handleChatDocumentsChange}
        />
      ) : null;
  } else if (chatMode === "facilitation" && canFacilitate) {
    mainPanel = <FacilitationChat sessionId={sessionId} />;
  } else if (!canParticipate && canFacilitate) {
    mainPanel = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="space-y-2">
          <h2 className="text-base font-medium">Start your interview</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Opt in to participate in this session&apos;s individual interview phase.
          </p>
        </div>
        <Button type="button" disabled={optInLoading} onClick={() => void handleOptIn()}>
          {optInLoading ? "Starting…" : "Start my interview"}
        </Button>
      </div>
    );
  } else {
    mainPanel = (
      <InterviewChat
        key={`${sessionId}-${optInVersion}`}
        sessionId={sessionId}
        onBootstrap={handleBootstrap}
        onBeliefsChange={handleBeliefsChange}
        onError={handleChatError}
        onNavigate={onNavigate}
        onSessionComplete={handleSessionComplete}
        onScrollToMessageComplete={() => setScrollToTarget(null)}
        scrollToTarget={scrollToTarget}
        canManage={sessionDetail?.canManage}
        onShare={() => setShareOpen(true)}
        onTopicChange={loadSessions}
        sessionComplete={completion !== null}
        onChatDocumentsChange={handleChatDocumentsChange}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        {canFacilitate ? modeTabs : null}
        {mainPanel}
      </div>
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
      {(ctx) => (
        <AnalyticsProvider sessionId={sessionId}>
          <InterviewContent sessionId={sessionId} {...ctx} />
        </AnalyticsProvider>
      )}
    </AppChrome>
  );
}

export default InterviewApp;
