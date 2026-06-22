import { useEffect, useRef } from "react";

export type InterviewScrollTarget = {
  messageId: string;
  attachmentId?: string;
};

const MESSAGE_HIGHLIGHT = ["ring-2", "ring-primary/40", "rounded-xl", "transition-shadow"] as const;
const ATTACHMENT_HIGHLIGHT = [
  "ring-2",
  "ring-primary/40",
  "rounded-lg",
  "transition-shadow",
] as const;

function clearHighlight(kind: "message" | "attachment", id: string): void {
  const selector =
    kind === "attachment"
      ? `[data-attachment-id="${CSS.escape(id)}"]`
      : `[data-message-id="${CSS.escape(id)}"]`;
  const classes = kind === "attachment" ? ATTACHMENT_HIGHLIGHT : MESSAGE_HIGHLIGHT;
  document.querySelector<HTMLElement>(selector)?.classList.remove(...classes);
}

export function useScrollToMessage(
  scrollTarget: InterviewScrollTarget | null | undefined,
  onScrollToMessageComplete?: () => void,
  ready = true,
) {
  const highlightedRef = useRef<{ kind: "message" | "attachment"; id: string } | null>(null);

  useEffect(() => {
    if (!ready || scrollTarget === null || scrollTarget === undefined) return;

    const { messageId, attachmentId } = scrollTarget;
    const highlightAttachment = attachmentId !== undefined && attachmentId.length > 0;

    let element: HTMLElement | null = null;
    let highlightKind: "message" | "attachment";
    let highlightId: string;
    let highlightClasses: readonly string[];

    if (highlightAttachment) {
      element = document.querySelector<HTMLElement>(
        `[data-attachment-id="${CSS.escape(attachmentId)}"]`,
      );
      highlightKind = "attachment";
      highlightId = attachmentId;
      highlightClasses = ATTACHMENT_HIGHLIGHT;
    } else {
      element = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
      highlightKind = "message";
      highlightId = messageId;
      highlightClasses = MESSAGE_HIGHLIGHT;
    }

    if (element === null) {
      if (highlightAttachment) {
        const messageElement = document.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(messageId)}"]`,
        );
        messageElement?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    if (highlightedRef.current !== null) {
      clearHighlight(highlightedRef.current.kind, highlightedRef.current.id);
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add(...highlightClasses);
    highlightedRef.current = { kind: highlightKind, id: highlightId };

    const timeout = window.setTimeout(() => {
      element.classList.remove(...highlightClasses);
      highlightedRef.current = null;
      onScrollToMessageComplete?.();
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [ready, scrollTarget, onScrollToMessageComplete]);
}
