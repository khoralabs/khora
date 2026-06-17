import { SessionSidebar } from "@/components/exedra/session-sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { MeResponse, MeTeam } from "@/lib/me-api";
import type { SessionSummary } from "@/lib/sessions-api";

import { useMobileChromeLayout } from "./mobile-chrome-layout";

export type AppSidebarProps = {
  me: MeResponse;
  teams: MeTeam[];
  activeTeam: MeTeam;
  sessions: SessionSummary[] | null;
  activeSessionId: string | null;
  pathname: string;
  collapsed: boolean;
  createSessionDisabled?: boolean;
  onTeamChange: (team: MeTeam) => void;
  onCreateSession: () => void;
  onCreateTeam?: () => void;
  onSelectSession: (sessionId: string) => void;
  onOpenTeamGraph: () => void;
  onOpenPersonalGraph: () => void;
  onOpenSettings?: () => void;
  onSignOut?: () => void;
  settingsMode?: boolean;
  onNavigate?: (path: string) => void;
};

export function AppSidebar(props: AppSidebarProps) {
  const { sidebarOpen, setSidebarOpen, isCompactChrome } = useMobileChromeLayout();

  return (
    <>
      <SessionSidebar {...props} className="hidden lg:flex" />

      <Sheet open={sidebarOpen && isCompactChrome} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="gap-0 p-0 sm:max-w-xs">
          <SessionSidebar
            {...props}
            sheetMode
            collapsed={false}
            onDismiss={() => setSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
