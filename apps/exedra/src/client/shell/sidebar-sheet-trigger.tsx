import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useMobileChromeLayoutOptional } from "./mobile-chrome-layout";

type SidebarSheetTriggerProps = {
  className?: string;
};

export function SidebarSheetTrigger({ className }: SidebarSheetTriggerProps) {
  const mobileLayout = useMobileChromeLayoutOptional();
  if (mobileLayout === null || !mobileLayout.isCompactChrome) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("shrink-0 lg:hidden", className)}
      aria-label="Open sidebar"
      onClick={() => mobileLayout.setSidebarOpen(true)}
    >
      <Menu />
    </Button>
  );
}
