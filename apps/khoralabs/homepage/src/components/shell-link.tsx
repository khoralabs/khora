import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function ShellLink({ className, ...props }: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "text-[#F4F4EF] underline decoration-[#F4F4EF]/40 underline-offset-4 transition-opacity hover:opacity-80",
        className,
      )}
      {...props}
    />
  );
}
