import { Lightbulb, Share2 } from "lucide-react";

import { SessionViewToggle } from "@/components/exedra/session-view-toggle";
import { Button } from "@/components/ui/button";
import type { InterviewBootstrap } from "@/lib/interview-api";
import { appSectionHeaderClassName } from "@/shell/app-section-header";
import { useMobileChromeLayoutOptional } from "@/shell/mobile-chrome-layout";
import { SidebarCollapseTrigger } from "@/shell/sidebar-collapse-trigger";
import { SidebarSheetTrigger } from "@/shell/sidebar-sheet-trigger";

type InterviewChatHeaderProps = {
  bootstrap: InterviewBootstrap;
  sessionId: string;
  connected: boolean;
  canManage?: boolean;
  onNavigate: (path: string) => void;
  onShare?: () => void;
};

export function InterviewChatHeader({
  bootstrap,
  sessionId,
  connected,
  canManage,
  onNavigate,
  onShare,
}: InterviewChatHeaderProps) {
  const mobileLayout = useMobileChromeLayoutOptional();

  return (
    <div className={appSectionHeaderClassName("gap-2 px-3 lg:gap-3 lg:px-4")}>
      <SidebarSheetTrigger />
      <SidebarCollapseTrigger />

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

      {canManage && onShare !== undefined ? (
        <Button type="button" variant="outline" size="sm" onClick={onShare}>
          <Share2 />
          Share
        </Button>
      ) : null}

      <SessionViewToggle activeView="chat" onNavigate={onNavigate} sessionId={sessionId} />
      {!connected ? (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">Connecting…</span>
      ) : null}
    </div>
  );
}
