import type * as React from "react";
import { cn } from "../../lib/utils.ts";

export function Button({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
