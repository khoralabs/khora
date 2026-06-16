import { MessageSquare, Network } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SessionViewToggleProps = {
  sessionId: string;
  activeView: "chat" | "graph";
  onNavigate: (path: string) => void;
};

export function SessionViewToggle({ sessionId, activeView, onNavigate }: SessionViewToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-md border p-0.5">
      <Button
        aria-label="Chat view"
        className={cn(activeView === "chat" && "bg-muted")}
        onClick={() => onNavigate(`/sessions/${sessionId}/interview`)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <MessageSquare />
      </Button>
      <Button
        aria-label="Graph view"
        className={cn(activeView === "graph" && "bg-muted")}
        onClick={() => onNavigate(`/sessions/${sessionId}/graph`)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Network />
      </Button>
    </div>
  );
}
