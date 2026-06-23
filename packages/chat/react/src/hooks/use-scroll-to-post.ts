import { useEffect, useRef } from "react";

export type ScrollTarget = {
  postId: string;
  attachmentId?: string;
};

const ATTACHMENT_HIGHLIGHT = [
  "ring-2",
  "ring-primary/40",
  "rounded-lg",
  "transition-shadow",
] as const;
const MESSAGE_HEADER_SELECTOR = "[data-message-header]";
const MESSAGE_HIGHLIGHT_DURATION_MS = 2000;
const ATTACHMENT_HIGHLIGHT_DURATION_MS = 2000;

function clearHighlight(kind: "post" | "attachment", id: string): void {
  if (kind !== "attachment") return;
  document
    .querySelector<HTMLElement>(`[data-attachment-id="${CSS.escape(id)}"]`)
    ?.classList.remove(...ATTACHMENT_HIGHLIGHT);
}

function postSelector(postId: string): string {
  return `[data-post-id="${CSS.escape(postId)}"], [data-message-id="${CSS.escape(postId)}"]`;
}

function messageHeaderForPost(postId: string): HTMLElement | null {
  const postElement = document.querySelector<HTMLElement>(postSelector(postId));
  return postElement?.querySelector<HTMLElement>(MESSAGE_HEADER_SELECTOR) ?? postElement;
}

function animateMessageHeader(header: HTMLElement): void {
  const targets = header.children.length > 0 ? Array.from(header.children) : [header];
  for (const target of targets) {
    target.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }],
      {
        duration: MESSAGE_HIGHLIGHT_DURATION_MS,
        easing: "ease-out",
      },
    );
  }
}

export function useScrollToPost(
  scrollTarget: ScrollTarget | null | undefined,
  onComplete?: () => void,
  ready = true,
) {
  const highlightedRef = useRef<{ kind: "post" | "attachment"; id: string } | null>(null);

  useEffect(() => {
    if (!ready || scrollTarget === null || scrollTarget === undefined) return;

    const { postId, attachmentId } = scrollTarget;
    const highlightAttachment = attachmentId !== undefined && attachmentId.length > 0;

    let element: HTMLElement | null = null;
    let highlightKind: "post" | "attachment";
    let highlightId: string;
    let highlightClasses: readonly string[] = [];
    let highlightDuration = MESSAGE_HIGHLIGHT_DURATION_MS;

    if (highlightAttachment) {
      element = document.querySelector<HTMLElement>(
        `[data-attachment-id="${CSS.escape(attachmentId)}"]`,
      );
      highlightKind = "attachment";
      highlightId = attachmentId;
      highlightClasses = ATTACHMENT_HIGHLIGHT;
      highlightDuration = ATTACHMENT_HIGHLIGHT_DURATION_MS;
    } else {
      element = messageHeaderForPost(postId);
      highlightKind = "post";
      highlightId = postId;
    }

    if (element === null) {
      if (highlightAttachment) {
        messageHeaderForPost(postId)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    if (highlightedRef.current !== null) {
      clearHighlight(highlightedRef.current.kind, highlightedRef.current.id);
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    if (highlightKind === "post") {
      element.focus({ preventScroll: true });
      animateMessageHeader(element);
    } else {
      element.classList.add(...highlightClasses);
    }
    highlightedRef.current = { kind: highlightKind, id: highlightId };

    const timeout = window.setTimeout(() => {
      if (highlightClasses.length > 0) {
        element.classList.remove(...highlightClasses);
      }
      highlightedRef.current = null;
      onComplete?.();
    }, highlightDuration);

    return () => window.clearTimeout(timeout);
  }, [ready, scrollTarget, onComplete]);
}
