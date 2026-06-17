import { useCallback, useState } from "react";

import { InterviewCanvas } from "@/components/exedra/interview-canvas";
import { InterviewChat } from "@/components/interview/interview-chat";
import type { BeliefFeedback, BeliefFlag, InterviewBootstrap } from "@/lib/interview-api";
import type { SessionDetail } from "@/lib/sessions-api";

import { AppChrome } from "../../shell/app-chrome";
import { parseInterviewSessionId } from "../../shell/routes";

import "../index.css";

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
      setBeliefs((current) =>
        current.map((belief) => (belief.id === id ? { ...belief, ...update } : belief)),
      );
    },
    [],
  );

  const handleBeliefSourceClick = useCallback((sourceMessageId: string) => {
    setScrollToMessageId(sourceMessageId);
  }, []);

  const handleChatError = useCallback((error: string | null) => {
    setChatError(error);
  }, []);

  return (
    <>
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
      />
      {chatError !== null ? (
        <div className="sr-only" aria-live="polite">
          {chatError}
        </div>
      ) : null}
      <InterviewCanvas
        sessionId={sessionId}
        beliefs={beliefs}
        sessionDetail={sessionDetail}
        onBeliefSourceClick={handleBeliefSourceClick}
        onBeliefUpdate={handleBeliefUpdate}
        onRefreshDetail={() => {
          loadSessionDetail(sessionId);
          loadSessions();
        }}
      />
    </>
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
