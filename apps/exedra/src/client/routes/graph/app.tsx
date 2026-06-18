import { MemoriesGraphView } from "@/components/exedra/memories-graph-view";
import { SessionViewToggle } from "@/components/exedra/session-view-toggle";
import type { MeResponse, MeTeam } from "@/lib/me-api";
import {
  meMemoriesApiBase,
  orgMemoriesApiBase,
  orgSessionNamespace,
  orgTeamNamespace,
  userNamespace,
} from "@/lib/memories-api";
import type { SessionDetail } from "@/lib/sessions-api";

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
  sessionDetail,
}: {
  pathname: string;
  onNavigate: (path: string) => void;
  me: MeResponse;
  activeTeam: MeTeam;
  sessionDetail: SessionDetail | null;
}) {
  const sessionGraphId = parseSessionGraphId(pathname);
  const teamGraphId = parseActiveTeamGraphId(pathname);
  const personalGraph = isPersonalGraphPath(pathname);

  if (sessionGraphId !== null) {
    return (
      <MemoriesGraphView
        apiBase={orgMemoriesApiBase(activeTeam.orgId)}
        namespace={orgSessionNamespace(
          activeTeam.orgId,
          sessionDetail?.session.teamId ?? activeTeam.id,
          sessionGraphId,
        )}
        title={sessionDetail?.session.topic ?? "Session memories"}
        emptyDescription="This session doesn't have any memories yet. They'll appear here as the interview captures them."
        headerExtra={
          <SessionViewToggle
            activeView="graph"
            onNavigate={onNavigate}
            sessionId={sessionGraphId}
          />
        }
      />
    );
  }

  if (teamGraphId !== null) {
    return (
      <MemoriesGraphView
        apiBase={orgMemoriesApiBase(activeTeam.orgId)}
        namespace={orgTeamNamespace(activeTeam.orgId, teamGraphId)}
        title={`${activeTeam.name} memories`}
        emptyDescription={`${activeTeam.name} doesn't have any shared memories yet.`}
      />
    );
  }

  if (personalGraph) {
    return (
      <MemoriesGraphView
        apiBase={meMemoriesApiBase}
        namespace={userNamespace(me.user.userId)}
        title="Personal memories"
        emptyDescription="You don't have any personal memories yet."
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
