import type { ReactNode } from "react";

import { ASSETS } from "@/lib/asset-urls";
import { cn } from "@/lib/utils";

type AuthPageShellProps = {
  children: ReactNode;
  className?: string;
};

export function AuthPageShell({ children, className }: AuthPageShellProps) {
  return (
    <div className={cn("relative min-h-screen", className)}>
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <img
        src={ASSETS.logoCluster}
        alt="Khora"
        className="pointer-events-none fixed bottom-6 right-6 w-24 opacity-40 sm:bottom-8 sm:right-8 sm:w-28"
      />
    </div>
  );
}
