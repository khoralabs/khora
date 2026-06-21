import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SidebarCtasProps = {
  collapsed: boolean;
  children: ReactNode;
  className?: string;
};

export function SidebarCtas({ collapsed, children, className }: SidebarCtasProps) {
  return (
    <div
      className={cn(
        "border-b p-2",
        collapsed ? "flex flex-col items-center gap-1" : "flex flex-col gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
