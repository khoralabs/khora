import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  className?: string;
};

export function NewSessionButton({
  disabled,
  onboardingInterviewRequired,
  onboardingSessionId,
  onClick,
  collapsed = false,
  className,
}: NewSessionButtonProps) {
  const showInterviewPopover = disabled && onboardingInterviewRequired;

  if (showInterviewPopover) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            className={cn(!collapsed && "w-full", "cursor-default opacity-50", className)}
            size={collapsed ? "icon-sm" : "sm"}
            aria-disabled
            aria-label="New session"
          >
            <CalendarPlus />
            {!collapsed ? "New session" : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align={collapsed ? "center" : "start"}
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

  const button = (
    <Button
      type="button"
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

  if (collapsed) {
    return (
      <SidebarCollapsedTooltip collapsed label="New session">
        {button}
      </SidebarCollapsedTooltip>
    );
  }

  return button;
}
