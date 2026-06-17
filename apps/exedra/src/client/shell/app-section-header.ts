import { cn } from "@/lib/utils";

/** Fixed height for aligned top chrome across sidebar, main content, and canvas columns. */
export const APP_SECTION_HEADER_HEIGHT_CLASS = "h-14";

export function appSectionHeaderClassName(...className: Array<string | false | null | undefined>) {
  return cn("flex shrink-0 items-center border-b", APP_SECTION_HEADER_HEIGHT_CLASS, ...className);
}
