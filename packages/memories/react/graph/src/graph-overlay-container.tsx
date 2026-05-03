import type * as React from "react";
import { cn } from "./lib/utils";

export function GraphOverlayContainer({ children, className }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-4 p-4 rounded-md backdrop-blur-sm shadow-md", className)}>
      {children}
    </div>
  );
}
