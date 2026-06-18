import { Share2 } from "lucide-react";
import { useState } from "react";

import { KnowledgeScopePicker } from "@/components/exedra/knowledge-scope-picker";
import { MemoriesGraphView } from "@/components/exedra/memories-graph-view";
import { SessionViewToggle } from "@/components/exedra/session-view-toggle";
import { ShareSessionDialog } from "@/components/sessions/share-session-dialog";
import { Button } from "@/components/ui/button";
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
  const sessionGraphId = parseSessionGraphId(pathname);
  const teamGraphId = parseActiveTeamGraphId(pathname);
  const personalGraph = isPersonalGraphPath(pathname);
  const [shareOpen, setShareOpen] = useState(false);

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
    return (
      <>
        <MemoriesGraphView
          apiBase={orgMemoriesApiBase(activeTeam.orgId)}
          namespace={orgSessionNamespace(
            activeTeam.orgId,
            sessionDetail?.session.teamId ?? activeTeam.id,
            sessionGraphId,
          )}
          title={sessionDetail?.session.topic ?? "Session knowledge"}
          emptyDescription="No knowledge captured yet. It will appear here as the interview captures it."
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
    return (
      <MemoriesGraphView
        apiBase={orgMemoriesApiBase(activeTeam.orgId)}
        namespace={orgTeamNamespace(activeTeam.orgId, teamGraphId)}
        title={`${team.name} knowledge`}
        emptyDescription="No knowledge captured yet."
        headerExtra={scopePicker}
      />
    );
  }

  if (personalGraph) {
    return (
      <MemoriesGraphView
        apiBase={meMemoriesApiBase}
        namespace={userNamespace(me.user.userId)}
        title="Personal knowledge"
        emptyDescription="No knowledge captured yet."
        headerExtra={scopePicker}
      />
    );
  }

  window.location.href = "/";
  return null;
}

function GraphApp() {
  return <AppChrome entrypoint="graph">{(ctx) => <GraphContent {...ctx} />}</AppChrome>;
}

export default GraphApp;
