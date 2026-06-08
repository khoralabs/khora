import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function MutedBody({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-pretty text-sm leading-relaxed text-[#F4F4EF]/90 md:text-[15px] md:leading-[1.55]",
        className,
      )}
      {...props}
    />
  );
}
