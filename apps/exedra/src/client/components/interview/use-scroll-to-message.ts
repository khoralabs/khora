import { useEffect, useRef } from "react";

export function useScrollToMessage(
  scrollToMessageId: string | null | undefined,
  onScrollToMessageComplete?: () => void,
) {
  const highlightedMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (scrollToMessageId === null || scrollToMessageId === undefined) return;

    const element = document.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(scrollToMessageId)}"]`,
    );
    if (element === null) {
      onScrollToMessageComplete?.();
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("ring-2", "ring-primary/40", "rounded-xl", "transition-shadow");

    if (highlightedMessageRef.current !== null) {
      const previous = document.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(highlightedMessageRef.current)}"]`,
      );
      previous?.classList.remove("ring-2", "ring-primary/40", "rounded-xl", "transition-shadow");
    }
    highlightedMessageRef.current = scrollToMessageId;

    const timeout = window.setTimeout(() => {
      element.classList.remove("ring-2", "ring-primary/40", "rounded-xl", "transition-shadow");
      highlightedMessageRef.current = null;
      onScrollToMessageComplete?.();
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [scrollToMessageId, onScrollToMessageComplete]);
}
