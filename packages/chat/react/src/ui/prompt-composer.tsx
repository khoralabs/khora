"use client";

import type { ChatStatus } from "ai";
import { SquareIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { InputGroupButton } from "#components/ui/input-group.tsx";
import { TooltipProvider } from "#components/ui/tooltip.tsx";
import { cn } from "#lib/utils.ts";
import {
  PromptInput,
  PromptInputAttachButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "./ai-elements/prompt-input.tsx";
import { PromptComposerAttachments, PromptInputAttachmentBridge } from "./attachments-bridge.tsx";
import { chatColumnClassName } from "./layout.ts";

export function PromptComposer({
  connected,
  status,
  input,
  chatError,
  header,
  onAttachmentControlsReady,
  onSubmit,
  onStop,
  onTextChange,
  onError,
  placeholder = "Share your thoughts…",
  maxFileSize = 25 * 1024 * 1024,
  className,
  children,
}: {
  connected: boolean;
  status: ChatStatus;
  input: string;
  chatError: string | null;
  header?: ReactNode;
  onAttachmentControlsReady: (controls: {
    add: (files: File[] | FileList) => void;
    clear: () => void;
  }) => void;
  onSubmit: (message: PromptInputMessage) => void;
  onStop: () => void;
  onTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onError: (error: string) => void;
  placeholder?: string;
  maxFileSize?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("shrink-0 border-t p-4", className)}>
      <PromptComposerError error={chatError} />
      {header != null ? <div className={cn("mb-2 flex", chatColumnClassName)}>{header}</div> : null}
      <PromptInput
        className={cn("relative", chatColumnClassName)}
        maxFileSize={maxFileSize}
        multiple
        onError={(error) => onError(error.message)}
        onSubmit={onSubmit}
      >
        {children ?? (
          <>
            <PromptInputAttachmentBridge onControlsReady={onAttachmentControlsReady} />
            <PromptComposerAttachments />
            <PromptComposerInput
              input={input}
              onTextChange={onTextChange}
              placeholder={placeholder}
              status={status}
            />
            <PromptComposerFooter connected={connected} onStop={onStop} status={status} />
          </>
        )}
      </PromptInput>
    </div>
  );
}

export function PromptComposerError({ error }: { error: string | null }) {
  if (error === null) return null;
  return <p className={cn("mb-3 text-sm text-destructive", chatColumnClassName)}>{error}</p>;
}

export function PromptComposerInput({
  input,
  status,
  placeholder,
  onTextChange,
}: {
  input: string;
  status: ChatStatus;
  placeholder?: string;
  onTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <PromptInputTextarea
      className="min-h-[60px]"
      disabled={status !== "ready"}
      onChange={onTextChange}
      placeholder={placeholder}
      value={input}
    />
  );
}

export function PromptComposerTools({ children }: { children?: ReactNode }) {
  return (
    <TooltipProvider>
      <PromptInputTools>{children ?? <PromptInputAttachButton />}</PromptInputTools>
    </TooltipProvider>
  );
}

export function PromptComposerFooter({
  connected,
  status,
  onStop,
}: {
  connected: boolean;
  status: ChatStatus;
  onStop: () => void;
}) {
  return (
    <PromptInputFooter>
      <PromptComposerTools />
      <PromptComposerSubmit connected={connected} onStop={onStop} status={status} />
    </PromptInputFooter>
  );
}

export function PromptComposerSubmit({
  connected,
  status,
  onStop,
}: {
  connected: boolean;
  status: ChatStatus;
  onStop: () => void;
}) {
  const isGenerating = status === "submitted" || status === "streaming";

  if (isGenerating) {
    return (
      <InputGroupButton
        aria-label="Stop"
        size="icon-sm"
        type="button"
        variant="default"
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.preventDefault();
          onStop();
        }}
      >
        <SquareIcon className="size-4" />
      </InputGroupButton>
    );
  }

  return <PromptInputSubmit disabled={!connected} status={status} />;
}

export type { PromptInputMessage };
