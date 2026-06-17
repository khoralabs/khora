import { SessionViewToggle } from "@/components/exedra/session-view-toggle";
import type { InterviewBootstrap } from "@/lib/interview-api";

type InterviewChatHeaderProps = {
  bootstrap: InterviewBootstrap;
  sessionId: string;
  connected: boolean;
  onNavigate: (path: string) => void;
};

export function InterviewChatHeader({
  bootstrap,
  sessionId,
  connected,
  onNavigate,
}: InterviewChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{bootstrap.session.topic}</p>
      </div>
      <SessionViewToggle activeView="chat" onNavigate={onNavigate} sessionId={sessionId} />
      {!connected ? <span className="text-xs text-muted-foreground">Connecting…</span> : null}
    </div>
  );
}
