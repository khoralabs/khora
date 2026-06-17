import { CalendarPlus, MessageSquare } from "lucide-react";

import { SessionWizard } from "@/components/sessions/session-wizard";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SettingsContent } from "@/settings/settings-content";

import type { AppChromeContext } from "./app-chrome";
import { CompactChromeHeader } from "./compact-chrome-header";
import { isNewSessionPath, isSettingsPath, onboardingInterviewPath } from "./routes";

type MainContentProps = AppChromeContext;

export function MainContent({
  me,
  pathname,
  onNavigate,
  activeTeam,
  sessions,
  loadSessions,
  onProfileRefresh,
}: MainContentProps) {
  const createSessionDisabled = me.onboardingRequired || me.onboardingInterviewRequired;
  const creatingSession = isNewSessionPath(pathname);

  function handleSessionCreated(sessionId: string) {
    loadSessions();
    window.location.href = `/sessions/${sessionId}/interview`;
  }

  if (isSettingsPath(pathname)) {
    return (
      <SettingsContent
        me={me}
        pathname={pathname}
        onNavigate={onNavigate}
        activeTeam={activeTeam}
        onProfileRefresh={onProfileRefresh}
      />
    );
  }

  if (creatingSession && createSessionDisabled) {
    const onboardingSessionId = me.onboardingSessionId;
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CompactChromeHeader compactOnly title="New session" />
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <Empty className="max-w-md border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquare />
              </EmptyMedia>
              <EmptyTitle>Finish your onboarding interview first</EmptyTitle>
              <EmptyDescription>
                You can browse settings and memories while onboarding is in progress. New sessions
                unlock after your first interview is complete.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex flex-col gap-2 sm:flex-row">
              {onboardingSessionId !== null ? (
                <Button
                  onClick={() => {
                    window.location.href = onboardingInterviewPath(onboardingSessionId);
                  }}
                >
                  Continue onboarding interview
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => onNavigate("/")}>
                Back to home
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  if (creatingSession) {
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CompactChromeHeader compactOnly title="New session" />
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <SessionWizard
            team={activeTeam}
            onCancel={() => {
              if (sessions !== null && sessions[0] !== undefined) {
                window.location.href = `/sessions/${sessions[0].id}/interview`;
              } else {
                onNavigate("/");
              }
            }}
            onCreated={handleSessionCreated}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <CompactChromeHeader compactOnly />
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
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
            <Button disabled={createSessionDisabled} onClick={() => onNavigate("/sessions/new")}>
              <CalendarPlus />
              New session
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </div>
  );
}
