import { CalendarPlus, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import type { MeTeam } from "@/lib/me-api";
import { fetchSessions, formatSessionDate, type SessionSummary } from "@/lib/sessions-api";

type DashboardProps = {
  team: MeTeam;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
};

function SessionStatusBadge({ status }: { status: string }) {
  const variant = status === "closed" ? "secondary" : status === "active" ? "default" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

function SessionListItem({
  session,
  onSelect,
}: {
  session: SessionSummary;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/30"
      onClick={() => onSelect(session.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(session.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">{session.displayName}</CardTitle>
            <CardDescription>{session.topic}</CardDescription>
          </div>
          <SessionStatusBadge status={session.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{formatSessionDate(session.createdAtMs)}</span>
        <span>·</span>
        <span>{session.role === "facilitator" ? "Facilitator" : "Participant"}</span>
      </CardContent>
    </Card>
  );
}

export function Dashboard({ team, onCreateSession, onSelectSession }: DashboardProps) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSessions(team.id)
      .then((items) => {
        if (!cancelled) setSessions(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load sessions");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [team.id]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            {team.orgName} · {team.name}
          </p>
        </div>
        {sessions !== null && sessions.length > 0 ? (
          <Button onClick={onCreateSession}>
            <CalendarPlus />
            New session
          </Button>
        ) : null}
      </div>

      {sessions === null ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6" />
        </div>
      ) : sessions.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>No sessions yet</EmptyTitle>
            <EmptyDescription>
              Create a structured alignment session and invite stakeholders from your team.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onCreateSession}>
              <CalendarPlus />
              Create session
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => (
            <SessionListItem key={session.id} session={session} onSelect={onSelectSession} />
          ))}
        </div>
      )}

      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
