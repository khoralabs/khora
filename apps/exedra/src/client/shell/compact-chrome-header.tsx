import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { useMobileChromeLayoutOptional } from "./mobile-chrome-layout";
import { SidebarSheetTrigger } from "./sidebar-sheet-trigger";

type CompactChromeHeaderProps = {
  title?: string;
  leading?: ReactNode;
  children?: ReactNode;
  compactOnly?: boolean;
  className?: string;
};

export function CompactChromeHeader({
  title,
  leading,
  children,
  compactOnly = false,
  className,
}: CompactChromeHeaderProps) {
  const mobileLayout = useMobileChromeLayoutOptional();
  if (compactOnly && mobileLayout?.isCompactChrome !== true) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-b px-3 py-3 lg:gap-3 lg:px-4",
        className,
      )}
    >
      <SidebarSheetTrigger />
      {leading}
      {title !== undefined ? (
        <p className="min-w-0 flex-1 truncate font-medium">{title}</p>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {children}
    </div>
  );
}
