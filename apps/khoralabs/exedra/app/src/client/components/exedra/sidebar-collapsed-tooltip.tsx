import type { ReactElement, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type SidebarCollapsedTooltipProps = {
  collapsed: boolean;
  label: ReactNode;
  children: ReactElement;
};

export function SidebarCollapsedTooltip({
  collapsed,
  label,
  children,
}: SidebarCollapsedTooltipProps) {
  if (!collapsed) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
