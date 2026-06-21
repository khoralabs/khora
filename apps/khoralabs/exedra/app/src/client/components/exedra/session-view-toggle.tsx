import { MessageSquare, Network } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type SessionViewToggleProps = {
  sessionId: string;
  activeView: "chat" | "graph";
  onNavigate: (path: string) => void;
};

export function SessionViewToggle({ sessionId, activeView, onNavigate }: SessionViewToggleProps) {
  const track = useAnalytics();

  return (
    <div className="flex items-center gap-1 rounded-md border p-0.5">
      <Button
        aria-label="Chat view"
        className={cn("gap-1.5", activeView === "chat" && "bg-muted")}
        onClick={() => onNavigate(`/sessions/${sessionId}/interview`)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <MessageSquare />
        <span className="hidden sm:inline">Chat</span>
      </Button>
      <Button
        aria-label="Knowledge view"
        className={cn("gap-1.5", activeView === "graph" && "bg-muted")}
        onClick={() => {
          track("graph_opened", { scope: "session", sessionId });
          onNavigate(`/sessions/${sessionId}/graph`);
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Network />
        <span className="hidden sm:inline">Knowledge</span>
      </Button>
    </div>
  );
}
