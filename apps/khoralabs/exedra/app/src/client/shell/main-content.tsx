import { MessageSquare } from "lucide-react";

import { NewSessionButton } from "@/components/exedra/new-session-button";
import { SessionWizard } from "@/components/sessions/session-wizard";
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
import { isNewSessionPath, isSettingsPath } from "./routes";

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
  const createSessionDisabled = me.onboardingRequired;
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
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CompactChromeHeader compactOnly title="New session" />
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <Empty className="max-w-md border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquare />
              </EmptyMedia>
              <EmptyTitle>Finish organization setup first</EmptyTitle>
              <EmptyDescription>
                Complete onboarding to create your organization and team before starting sessions.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <NewSessionButton disabled onClick={() => undefined} />
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
            <NewSessionButton
              disabled={createSessionDisabled}
              onClick={() => onNavigate("/sessions/new")}
            />
          </EmptyContent>
        </Empty>
      </div>
    </div>
  );
}
