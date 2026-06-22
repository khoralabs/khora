import { Share2 } from "lucide-react";
import { useCallback, useState } from "react";

import { KnowledgeScopePicker } from "@/components/exedra/knowledge-scope-picker";
import { MemoriesGraphView } from "@/components/exedra/memories-graph-view";
import { SessionViewToggle } from "@/components/exedra/session-view-toggle";
import { ShareSessionDialog } from "@/components/sessions/share-session-dialog";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { AnalyticsProvider, useAnalytics } from "@/lib/analytics";
import type { MeResponse, MeTeam } from "@/lib/me-api";
import {
  meMemoriesApiBase,
  orgMemoriesApiBase,
  orgSessionNamespace,
  orgTeamNamespace,
  userNamespace,
} from "@/lib/memories-api";
import type { SessionDetail, SessionSummary } from "@/lib/sessions-api";

import { AppChrome } from "../../shell/app-chrome";
import {
  isPersonalGraphPath,
  parseActiveTeamGraphId,
  parseSessionGraphId,
} from "../../shell/routes";

import "../../styles/index.css";

function resolveSessionOrgId(args: {
  activeTeam: MeTeam;
  sessionId: string;
  sessionDetail: SessionDetail | null;
  sessions: SessionSummary[] | null;
}): string {
  const fromDetail = args.sessionDetail?.session.orgId?.trim();
  if (fromDetail !== undefined && fromDetail.length > 0) return fromDetail;

  const fromList = args.sessions?.find((session) => session.id === args.sessionId)?.orgId?.trim();
  if (fromList !== undefined && fromList.length > 0) return fromList;

  return args.activeTeam.orgId;
}

function GraphAccessDenied({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyTitle>Knowledge graph unavailable</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
        <Button type="button" variant="outline" onClick={onBack}>
          Go back
        </Button>
      </Empty>
    </div>
  );
}

function GraphContent({
  pathname,
  onNavigate,
  me,
  activeTeam,
  sessions,
  sessionDetail,
}: {
  pathname: string;
  onNavigate: (path: string) => void;
  me: MeResponse;
  activeTeam: MeTeam;
  sessions: SessionSummary[] | null;
  sessionDetail: SessionDetail | null;
}) {
  const track = useAnalytics();
  const sessionGraphId = parseSessionGraphId(pathname);
  const teamGraphId = parseActiveTeamGraphId(pathname);
  const personalGraph = isPersonalGraphPath(pathname);
  const [shareOpen, setShareOpen] = useState(false);

  const trackInvestigated = useCallback(
    (scope: "session" | "team" | "personal") => {
      track("graph_investigated", { scope });
    },
    [track],
  );

  const scopePicker = (
    <KnowledgeScopePicker
      me={me}
      activeTeam={activeTeam}
      sessions={sessions}
      pathname={pathname}
      onNavigate={onNavigate}
    />
  );

  if (sessionGraphId !== null) {
    const sessionSummary =
      sessionDetail?.session ?? sessions?.find((session) => session.id === sessionGraphId) ?? null;
    const sessionOrgId = resolveSessionOrgId({
      activeTeam,
      sessionId: sessionGraphId,
      sessionDetail,
      sessions,
    });
    const sessionTeamId = sessionSummary?.teamId ?? activeTeam.id;

    if (sessionSummary?.canReadKg === false) {
      return (
        <GraphAccessDenied
          message="You don't have permission to view this session's knowledge graph."
          onBack={() => onNavigate(`/sessions/${sessionGraphId}/interview`)}
        />
      );
    }

    if (sessionOrgId.length === 0) {
      return (
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      );
    }

    return (
      <>
        <MemoriesGraphView
          key={`session:${sessionGraphId}:${sessionOrgId}:${sessionTeamId}`}
          apiBase={orgMemoriesApiBase(sessionOrgId)}
          namespace={orgSessionNamespace(sessionOrgId, sessionTeamId, sessionGraphId)}
          orgId={sessionOrgId}
          teamId={sessionTeamId}
          sessionId={sessionGraphId}
          title={sessionSummary?.topic ?? "Session knowledge"}
          emptyDescription="No knowledge captured yet. It will appear here as the interview captures it."
          onInvestigated={() => trackInvestigated("session")}
          canContribute={sessionSummary?.canContributeKg !== false}
          headerExtra={
            <>
              {sessionDetail?.canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShareOpen(true)}
                >
                  <Share2 />
                  Share
                </Button>
              ) : null}
              {scopePicker}
              <SessionViewToggle
                activeView="graph"
                onNavigate={onNavigate}
                sessionId={sessionGraphId}
              />
            </>
          }
        />
        <ShareSessionDialog
          sessionId={sessionGraphId}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      </>
    );
  }

  if (teamGraphId !== null) {
    const team = me.teams.find((t) => t.id === teamGraphId) ?? activeTeam;
    if (team.orgId.length === 0) {
      return (
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      );
    }
    return (
      <MemoriesGraphView
        key={`team:${teamGraphId}:${team.orgId}`}
        apiBase={orgMemoriesApiBase(team.orgId)}
        namespace={orgTeamNamespace(team.orgId, teamGraphId)}
        orgId={team.orgId}
        teamId={teamGraphId}
        title={`${team.name} knowledge`}
        emptyDescription="No knowledge captured yet."
        onInvestigated={() => trackInvestigated("team")}
        headerExtra={scopePicker}
      />
    );
  }

  if (personalGraph) {
    return (
      <MemoriesGraphView
        key={`personal:${me.user.userId}`}
        apiBase={meMemoriesApiBase}
        namespace={userNamespace(me.user.userId)}
        title="Personal knowledge"
        emptyDescription="No knowledge captured yet."
        onInvestigated={() => trackInvestigated("personal")}
        headerExtra={scopePicker}
      />
    );
  }

  window.location.href = "/";
  return null;
}

function GraphApp() {
  return (
    <AppChrome entrypoint="graph">
      {(ctx) => {
        const sessionGraphId = parseSessionGraphId(ctx.pathname);
        return (
          <AnalyticsProvider sessionId={sessionGraphId ?? undefined}>
            <GraphContent {...ctx} />
          </AnalyticsProvider>
        );
      }}
    </AppChrome>
  );
}

export default GraphApp;
