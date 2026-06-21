import type { VariantProps } from "class-variance-authority";
import { CalendarPlus, Plus } from "lucide-react";

import { Button, type buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { onboardingInterviewPath } from "@/shell/routes";

import { SidebarCollapsedTooltip } from "./sidebar-collapsed-tooltip";

type NewSessionButtonProps = {
  disabled: boolean;
  onboardingInterviewRequired: boolean;
  onboardingSessionId: string | null;
  onClick: () => void;
  collapsed?: boolean;
  /** Render a compact ghost plus icon (e.g. at the end of a group header row). */
  iconOnly?: boolean;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  className?: string;
};

export function NewSessionButton({
  disabled,
  onboardingInterviewRequired,
  onboardingSessionId,
  onClick,
  collapsed = false,
  iconOnly = false,
  variant = "default",
  className,
}: NewSessionButtonProps) {
  const showInterviewPopover = disabled && onboardingInterviewRequired;

  const trigger = iconOnly ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("shrink-0", showInterviewPopover && "cursor-default opacity-50", className)}
      disabled={disabled && !showInterviewPopover}
      aria-disabled={showInterviewPopover || undefined}
      aria-label="New session"
      onClick={showInterviewPopover ? undefined : onClick}
    >
      <Plus />
    </Button>
  ) : (
    <Button
      type="button"
      variant={variant}
      className={cn(
        !collapsed && "w-full",
        showInterviewPopover && "cursor-default opacity-50",
        className,
      )}
      size={collapsed ? "icon-sm" : "sm"}
      disabled={disabled && !showInterviewPopover}
      aria-disabled={showInterviewPopover || undefined}
      aria-label="New session"
      onClick={showInterviewPopover ? undefined : onClick}
    >
      <CalendarPlus />
      {!collapsed ? "New session" : null}
    </Button>
  );

  if (showInterviewPopover) {
    return (
      <Popover>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align={collapsed ? "center" : iconOnly ? "end" : "start"}
          className="w-72"
          side={collapsed ? "right" : "bottom"}
        >
          <PopoverHeader>
            <PopoverTitle>Complete your onboarding interview first</PopoverTitle>
            <PopoverDescription>
              Finish your initial interview session before creating additional sessions.
            </PopoverDescription>
          </PopoverHeader>
          {onboardingSessionId !== null ? (
            <div className="flex justify-end border-t pt-3">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  window.location.href = onboardingInterviewPath(onboardingSessionId);
                }}
              >
                Continue onboarding interview
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    );
  }

  if (collapsed && !iconOnly) {
    return (
      <SidebarCollapsedTooltip collapsed label="New session">
        {trigger}
      </SidebarCollapsedTooltip>
    );
  }

  return trigger;
}
