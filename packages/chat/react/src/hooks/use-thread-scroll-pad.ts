import type { ChatStatus } from "ai";
import { type RefObject, useLayoutEffect } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

const CONTENT_GAP_PX = 32;
const CONTENT_PADDING_BOTTOM_PX = 16;
const ANCHOR_TOP_INSET_PX = 12;

export type ScrollAnchorMessage = {
  id: string;
  role: string;
};

export function scrollAnchorPostId(
  messages: ScrollAnchorMessage[],
  status: ChatStatus,
): string | null {
  if (status !== "submitted") return null;
  const last = messages[messages.length - 1];
  return last?.role === "user" ? last.id : null;
}

function measureScrollPadHeight(
  scrollEl: HTMLElement | null | undefined,
  contentEl: HTMLElement | null | undefined,
  anchorPostId: string,
  showAgentLoading: boolean,
): number {
  if (scrollEl == null || contentEl == null) return 0;

  const messageContent = contentEl.querySelector(
    `[data-post-id="${CSS.escape(anchorPostId)}"], [data-message-id="${CSS.escape(anchorPostId)}"]`,
  );
  const messageEl = messageContent?.parentElement;
  if (messageEl === null || messageEl === undefined) return 0;

  const viewportHeight = scrollEl.clientHeight;
  const messageHeight = messageEl.getBoundingClientRect().height;

  let tailHeight = CONTENT_GAP_PX;
  if (showAgentLoading) {
    const loadingEl = contentEl.querySelector("[data-agent-loading]");
    const loadingHeight = loadingEl?.getBoundingClientRect().height ?? 0;
    tailHeight += loadingHeight + CONTENT_GAP_PX;
  }

  return Math.max(
    0,
    viewportHeight - messageHeight - tailHeight - CONTENT_PADDING_BOTTOM_PX - ANCHOR_TOP_INSET_PX,
  );
}

export function useThreadScrollPad(
  anchorPostId: string | null,
  showAgentLoading: boolean,
  padRef: RefObject<HTMLDivElement | null>,
): void {
  const { scrollRef, contentRef, scrollToBottom } = useStickToBottomContext();

  useLayoutEffect(() => {
    const padEl = padRef.current;
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;

    const applyPad = (height: number) => {
      if (padEl !== null) {
        padEl.style.height = `${height}px`;
      }
    };

    if (anchorPostId === null || scrollEl == null || contentEl == null) {
      applyPad(0);
      return;
    }

    const sync = () => {
      const padHeight = measureScrollPadHeight(scrollEl, contentEl, anchorPostId, showAgentLoading);
      applyPad(padHeight);
      void scrollToBottom({ animation: "instant" });
    };

    sync();

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(scrollEl);
    resizeObserver.observe(contentEl);

    const messageContent = contentEl.querySelector(
      `[data-post-id="${CSS.escape(anchorPostId)}"], [data-message-id="${CSS.escape(anchorPostId)}"]`,
    );
    const messageEl = messageContent?.parentElement;
    if (messageEl !== null && messageEl !== undefined) {
      resizeObserver.observe(messageEl);
    }

    const loadingEl = contentEl.querySelector("[data-agent-loading]");
    if (loadingEl !== null) {
      resizeObserver.observe(loadingEl);
    }

    return () => resizeObserver.disconnect();
  }, [anchorPostId, showAgentLoading, padRef, scrollRef, contentRef, scrollToBottom]);
}
