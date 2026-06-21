import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useMobileChromeLayoutOptional } from "./mobile-chrome-layout";
import { useSidebarChromeOptional } from "./sidebar-chrome-context";

type SidebarCollapseTriggerProps = {
  className?: string;
};

export function SidebarCollapseTrigger({ className }: SidebarCollapseTriggerProps) {
  const sidebarChrome = useSidebarChromeOptional();
  const mobileLayout = useMobileChromeLayoutOptional();
  if (sidebarChrome === null || mobileLayout?.isCompactChrome) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("hidden shrink-0 lg:inline-flex", className)}
      aria-label={sidebarChrome.collapsed ? "Expand sidebar" : "Collapse sidebar"}
      onClick={sidebarChrome.toggleCollapsed}
    >
      {sidebarChrome.collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
    </Button>
  );
}
