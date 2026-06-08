import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function PageTitle({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      className={cn("text-balance text-2xl font-normal leading-tight md:text-3xl", className)}
      {...props}
    />
  );
}
