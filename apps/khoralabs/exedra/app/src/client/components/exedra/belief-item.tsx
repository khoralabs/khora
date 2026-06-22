import { Check, Link2, Pencil, ThumbsDown, ThumbsUp } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
} from "@/components/ui/item";
import type { BeliefFeedback, BeliefFlag } from "@/lib/interview-api";
import { cn } from "@/lib/utils";

type BeliefItemProps = {
  belief: BeliefFlag;
  onSourceClick: (sourceMessageId: string) => void;
  onUpdate: (id: string, update: { feedback?: BeliefFeedback; correction?: string }) => void;
  readOnly?: boolean;
};

export function BeliefItem({ belief, onSourceClick, onUpdate, readOnly = false }: BeliefItemProps) {
  const [mode, setMode] = useState<"idle" | "correcting" | "editing">("idle");
  const [draft, setDraft] = useState("");

  const hasCorrection =
    belief.feedback === "corrected" &&
    belief.correction !== undefined &&
    belief.correction.length > 0;
  const isConfirmed = belief.feedback === "confirmed";
  const showCorrectionEditor = mode === "correcting" || mode === "editing";
  const showReviewActions = !readOnly && !isConfirmed && !hasCorrection && !showCorrectionEditor;

  useEffect(() => {
    if (mode === "editing" && belief.correction !== undefined) {
      setDraft(belief.correction);
    }
  }, [mode, belief.correction]);

  const handleSourceClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onSourceClick(belief.sourceMessageId);
    },
    [belief.sourceMessageId, onSourceClick],
  );

  const handleThumbUp = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setMode("idle");
      onUpdate(belief.id, { feedback: "confirmed" });
    },
    [belief.id, onUpdate],
  );

  const handleThumbDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDraft("");
    setMode("correcting");
  }, []);

  const handleConfirmCorrection = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const trimmed = draft.trim();
      if (trimmed.length === 0) return;
      onUpdate(belief.id, { feedback: "corrected", correction: trimmed });
      setMode("idle");
    },
    [belief.id, draft, onUpdate],
  );

  const handleEditCorrection = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setMode("editing");
  }, []);

  return (
    <Item className="flex-col flex-nowrap items-stretch gap-0 p-0" size="sm" variant="outline">
      <ItemHeader className="items-start gap-2 px-3 py-3 sm:gap-3">
        <ItemContent className="min-w-0 flex-1 gap-2">
          <ItemDescription
            className={cn(
              "line-clamp-none text-foreground",
              hasCorrection && "text-muted-foreground line-through",
            )}
          >
            {belief.belief}
          </ItemDescription>
          <Button
            className="h-auto w-fit gap-1 px-0 text-xs text-muted-foreground"
            onClick={handleSourceClick}
            type="button"
            variant="link"
          >
            <Link2 className="size-3 shrink-0" aria-hidden />
            <span className="sm:hidden">Source</span>
            <span className="hidden sm:inline">View source message</span>
          </Button>
        </ItemContent>

        <ItemActions className="shrink-0 flex-col items-end gap-1 self-start">
          {isConfirmed ? (
            <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
              <Check className="size-3 shrink-0" aria-hidden />
              Confirmed
            </p>
          ) : null}
          {showReviewActions ? (
            <div className="flex shrink-0 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover/item:opacity-100">
              <Button
                aria-label="Confirm belief"
                className="text-muted-foreground hover:text-green-600 dark:hover:text-green-500"
                onClick={handleThumbUp}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <ThumbsUp />
              </Button>
              <Button
                aria-label="Correct belief"
                className="text-muted-foreground hover:text-destructive"
                onClick={handleThumbDown}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <ThumbsDown />
              </Button>
            </div>
          ) : null}
        </ItemActions>
      </ItemHeader>

      {showCorrectionEditor ? (
        <ItemFooter className="flex-col items-stretch border-t px-3 py-3">
          <InputGroup>
            <InputGroupTextarea
              autoFocus
              className="min-h-[72px]"
              onChange={(event) => setDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder="What should this belief say instead?"
              value={draft}
            />
            <InputGroupAddon align="block-end" className="justify-end pb-2 pr-2">
              <InputGroupButton
                disabled={draft.trim().length === 0}
                onClick={handleConfirmCorrection}
                type="button"
              >
                Confirm
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </ItemFooter>
      ) : null}

      {hasCorrection && !showCorrectionEditor ? (
        <ItemFooter className="flex-col items-stretch gap-0 border-t px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-sm leading-relaxed">{belief.correction}</p>
            {!readOnly ? (
              <Button
                aria-label="Edit correction"
                className="shrink-0 text-muted-foreground"
                onClick={handleEditCorrection}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Pencil />
              </Button>
            ) : null}
          </div>
        </ItemFooter>
      ) : null}
    </Item>
  );
}
