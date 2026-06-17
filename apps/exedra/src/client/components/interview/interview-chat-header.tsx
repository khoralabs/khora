import { Lightbulb } from "lucide-react";

import { SessionViewToggle } from "@/components/exedra/session-view-toggle";
import { Button } from "@/components/ui/button";
import type { InterviewBootstrap } from "@/lib/interview-api";
import { useMobileChromeLayoutOptional } from "@/shell/mobile-chrome-layout";
import { SidebarSheetTrigger } from "@/shell/sidebar-sheet-trigger";

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
  const mobileLayout = useMobileChromeLayoutOptional();

  return (
    <div className="flex items-center gap-2 border-b px-3 py-3 lg:gap-3 lg:px-4">
      <SidebarSheetTrigger />

      <div className="min-w-0 flex-1">
        <p className="truncate text-center font-medium lg:text-left">{bootstrap.session.topic}</p>
      </div>

      {mobileLayout?.isCompactChrome ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 lg:hidden"
          aria-label="Open beliefs panel"
          onClick={() => mobileLayout.setCanvasOpen(true)}
        >
          <Lightbulb />
        </Button>
      ) : null}

      <SessionViewToggle activeView="chat" onNavigate={onNavigate} sessionId={sessionId} />
      {!connected ? (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">Connecting…</span>
      ) : null}
    </div>
  );
}
