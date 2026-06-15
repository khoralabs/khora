import { CalendarPlus, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AccountEditorDialog } from "@/components/account/account-editor-dialog";
import { InterviewCanvas } from "@/components/exedra/interview-canvas";
import { SessionSidebar } from "@/components/exedra/session-sidebar";
import { InterviewChat } from "@/components/interview/interview-chat";
import { OnboardingDialog } from "@/components/onboarding/onboarding-dialog";
import { SessionWizard } from "@/components/sessions/session-wizard";
import { CreateTeamDialog } from "@/components/teams/create-team-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { BeliefFeedback, BeliefFlag, InterviewBootstrap } from "@/lib/interview-api";
import { type MeResponse, type MeTeam, ONBOARDING_PLACEHOLDER_TEAM } from "@/lib/me-api";
import {
  fetchSessionDetail,
  fetchSessions,
  type SessionDetail,
  type SessionSummary,
} from "@/lib/sessions-api";

type ExedraShellProps = {
  me: MeResponse;
  pathname: string;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
  onOnboardingComplete: () => void;
  onProfileRefresh: () => void;
};

function parseActiveSessionId(pathname: string): string | null {
  const interviewMatch = /^\/sessions\/([^/]+)\/interview\/?$/.exec(pathname);
  if (interviewMatch?.[1] !== undefined) return interviewMatch[1];

  const sessionMatch = /^\/sessions\/([^/]+)\/?$/.exec(pathname);
  if (sessionMatch?.[1] !== undefined && sessionMatch[1] !== "new") return sessionMatch[1];

  return null;
}

function isNewSessionPath(pathname: string): boolean {
  return /^\/sessions\/new\/?$/.test(pathname);
}

export function ExedraShell({
  me,
  pathname,
  onNavigate,
  onSignOut,
  onOnboardingComplete,
  onProfileRefresh,
}: ExedraShellProps) {
  const onboardingRequired = me.onboardingRequired;
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [accountEditorOpen, setAccountEditorOpen] = useState(false);
  const [activeTeam, setActiveTeam] = useState<MeTeam>(
    () => me.teams[0] ?? ONBOARDING_PLACEHOLDER_TEAM,
  );
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [beliefs, setBeliefs] = useState<BeliefFlag[]>([]);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const activeSessionId = parseActiveSessionId(pathname);
  const creatingSession = isNewSessionPath(pathname);

  const loadSessions = useCallback(() => {
    if (activeTeam.id.length === 0) return;
    void fetchSessions(activeTeam.id)
      .then(setSessions)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load sessions");
      });
  }, [activeTeam.id]);

  const loadSessionDetail = useCallback((sessionId: string) => {
    void fetchSessionDetail(sessionId)
      .then(setSessionDetail)
      .catch(() => setSessionDetail(null));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (me.teams.length === 0) {
      setActiveTeam(ONBOARDING_PLACEHOLDER_TEAM);
      return;
    }
    const stillMember = me.teams.some((team) => team.id === activeTeam.id);
    if (!stillMember && me.teams[0] !== undefined) {
      setActiveTeam(me.teams[0]);
    }
  }, [me.teams, activeTeam.id]);

  useEffect(() => {
    if (activeSessionId === null) {
      setSessionDetail(null);
      setBeliefs([]);
      return;
    }
    loadSessionDetail(activeSessionId);
  }, [activeSessionId, loadSessionDetail]);

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

  function handleSelectSession(sessionId: string) {
    onNavigate(`/sessions/${sessionId}/interview`);
  }

  function handleSessionCreated(sessionId: string) {
    loadSessions();
    onNavigate(`/sessions/${sessionId}/interview`);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SessionSidebar
        me={me}
        teams={me.teams}
        activeTeam={activeTeam}
        sessions={sessions}
        activeSessionId={activeSessionId}
        collapsed={sidebarCollapsed}
        onboardingRequired={onboardingRequired}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onTeamChange={(team) => {
          setActiveTeam(team);
          onNavigate("/");
        }}
        onCreateSession={() => {
          if (onboardingRequired) return;
          onNavigate("/sessions/new");
        }}
        onCreateTeam={() => setCreateTeamOpen(true)}
        onSelectSession={handleSelectSession}
        onOpenAccountSettings={() => setAccountEditorOpen(true)}
        onSignOut={onSignOut}
      />

      {creatingSession ? (
        <div className="flex min-w-0 flex-1 overflow-y-auto p-6">
          <SessionWizard
            team={activeTeam}
            onCancel={() => {
              if (sessions !== null && sessions[0] !== undefined) {
                onNavigate(`/sessions/${sessions[0].id}/interview`);
              } else {
                onNavigate("/");
              }
            }}
            onCreated={handleSessionCreated}
          />
        </div>
      ) : activeSessionId !== null ? (
        <>
          <InterviewChat
            key={activeSessionId}
            sessionId={activeSessionId}
            onBootstrap={handleBootstrap}
            onBeliefsChange={handleBeliefsChange}
            onError={handleChatError}
            onScrollToMessageComplete={() => setScrollToMessageId(null)}
            scrollToMessageId={scrollToMessageId}
          />
          {chatError !== null ? (
            <div className="sr-only" aria-live="polite">
              {chatError}
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center p-6">
          <Empty className="max-w-md border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquare />
              </EmptyMedia>
              <EmptyTitle>Select a session</EmptyTitle>
              <EmptyDescription>
                Choose a session from the sidebar or create a new one to start your interview.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button disabled={onboardingRequired} onClick={() => onNavigate("/sessions/new")}>
                <CalendarPlus />
                New session
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}

      <InterviewCanvas
        sessionId={activeSessionId}
        beliefs={beliefs}
        sessionDetail={sessionDetail}
        onBeliefSourceClick={handleBeliefSourceClick}
        onBeliefUpdate={handleBeliefUpdate}
        onRefreshDetail={() => {
          if (activeSessionId !== null) loadSessionDetail(activeSessionId);
          loadSessions();
        }}
      />

      {loadError !== null ? (
        <p className="absolute bottom-4 left-4 text-sm text-destructive">{loadError}</p>
      ) : null}

      <OnboardingDialog open={onboardingRequired} onComplete={onOnboardingComplete} />

      <CreateTeamDialog
        open={createTeamOpen}
        org={activeTeam}
        onOpenChange={setCreateTeamOpen}
        onCreated={(team) => {
          onProfileRefresh();
          setActiveTeam(team);
          onNavigate("/");
        }}
      />

      <AccountEditorDialog
        open={accountEditorOpen}
        user={me.user}
        onOpenChange={setAccountEditorOpen}
        onSaved={() => onProfileRefresh()}
      />
    </div>
  );
}
