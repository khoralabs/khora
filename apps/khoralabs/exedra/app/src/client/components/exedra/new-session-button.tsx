import type { VariantProps } from "class-variance-authority";
import { CalendarPlus, Plus } from "lucide-react";

import { Button, type buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SidebarCollapsedTooltip } from "./sidebar-collapsed-tooltip";

type NewSessionButtonProps = {
  disabled: boolean;
  onClick: () => void;
  collapsed?: boolean;
  /** Render a compact ghost plus icon (e.g. at the end of a group header row). */
  iconOnly?: boolean;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  className?: string;
};

export function NewSessionButton({
  disabled,
  onClick,
  collapsed = false,
  iconOnly = false,
  variant = "default",
  className,
}: NewSessionButtonProps) {
  const trigger = iconOnly ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("shrink-0", className)}
      disabled={disabled}
      aria-label="New session"
      onClick={onClick}
    >
      <Plus />
    </Button>
  ) : (
    <Button
      type="button"
      variant={variant}
      className={cn(!collapsed && "w-full", className)}
      size={collapsed ? "icon-sm" : "sm"}
      disabled={disabled}
      aria-label="New session"
      onClick={onClick}
    >
      <CalendarPlus />
      {!collapsed ? "New session" : null}
    </Button>
  );

  if (collapsed && !iconOnly) {
    return (
      <SidebarCollapsedTooltip collapsed label="New session">
        {trigger}
      </SidebarCollapsedTooltip>
    );
  }

  return trigger;
}
