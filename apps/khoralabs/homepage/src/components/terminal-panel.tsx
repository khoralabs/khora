import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TerminalPanelProps = {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function TerminalPanel({
  title = "bash",
  action,
  children,
  className,
  bodyClassName,
}: TerminalPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-[#F4F4EF]/12",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-[#F4F4EF]/12 bg-[#2a2a2a] px-4 py-2.5">
        <span aria-hidden className="size-2 rounded-full bg-[#F4F4EF]/10" />
        <span aria-hidden className="size-2 rounded-full bg-[#F4F4EF]/10" />
        <span aria-hidden className="size-2 rounded-full bg-[#F4F4EF]/10" />
        <span className="ml-2 font-landing-mono text-[10px] text-[#F4F4EF]/30">{title}</span>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <div className={cn("bg-[#242424]", bodyClassName)}>{children}</div>
    </div>
  );
}

export const terminalInputClass =
  "min-w-0 flex-1 border-0 bg-transparent font-landing-mono text-[11px] leading-[1.7] text-[#F4F4EF]/85 shadow-none outline-none caret-[#F4F4EF]/85 placeholder:text-[#F4F4EF]/30 focus-visible:ring-0 md:text-xs";

export const terminalOtpSlotClass =
  "relative flex h-11 w-11 items-center justify-center rounded-md border border-[#F4F4EF]/12 bg-[#2a2a2a] font-landing-mono text-[11px] text-[#F4F4EF]/85 shadow-none transition-all outline-none first:rounded-l-md last:rounded-r-md data-[active=true]:z-10 data-[active=true]:border-[#F4F4EF]/30 data-[active=true]:ring-1 data-[active=true]:ring-[#F4F4EF]/15 [&_div.animate-caret-blink]:bg-[#F4F4EF]/85";
