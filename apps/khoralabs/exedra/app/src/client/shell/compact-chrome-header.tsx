import type { ReactNode } from "react";

import { appSectionHeaderClassName } from "./app-section-header";
import { useMobileChromeLayoutOptional } from "./mobile-chrome-layout";
import { SidebarCollapseTrigger } from "./sidebar-collapse-trigger";
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
  const isCompact = mobileLayout?.isCompactChrome === true;

  if (compactOnly && !isCompact) {
    return (
      <div
        className={appSectionHeaderClassName(
          "hidden gap-2 px-3 lg:flex lg:gap-3 lg:px-4",
          className,
        )}
      >
        <SidebarCollapseTrigger />
        <div className="min-w-0 flex-1" />
      </div>
    );
  }

  return (
    <div className={appSectionHeaderClassName("gap-2 px-3 lg:gap-3 lg:px-4", className)}>
      <SidebarSheetTrigger />
      <SidebarCollapseTrigger />
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
