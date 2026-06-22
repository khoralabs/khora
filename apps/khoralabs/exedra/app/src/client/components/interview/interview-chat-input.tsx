import type { ChatStatus } from "ai";
import { SquareIcon } from "lucide-react";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputAttachButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { InputGroupButton } from "@/components/ui/input-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  InterviewPromptAttachments,
  PromptInputAttachmentBridge,
} from "./interview-chat-attachments";
import { interviewChatColumnClassName } from "./interview-chat-layout";

type InterviewChatInputProps = {
  connected: boolean;
  status: ChatStatus;
  input: string;
  chatError: string | null;
  onAttachmentControlsReady: (controls: {
    add: (files: File[] | FileList) => void;
    clear: () => void;
  }) => void;
  onSubmit: (message: PromptInputMessage) => void;
  onStop: () => void;
  onTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onError: (error: string) => void;
  placeholder?: string;
};

export function InterviewChatInput({
  connected,
  status,
  input,
  chatError,
  onAttachmentControlsReady,
  onSubmit,
  onStop,
  onTextChange,
  onError,
  placeholder = "Share your thoughts…",
}: InterviewChatInputProps) {
  return (
    <div className="border-t p-4">
      {chatError !== null ? (
        <p className={cn("mb-3 text-sm text-destructive", interviewChatColumnClassName)}>
          {chatError}
        </p>
      ) : null}
      <PromptInput
        className={cn("relative", interviewChatColumnClassName)}
        maxFileSize={25 * 1024 * 1024}
        multiple
        onError={(error) => onError(error.message)}
        onSubmit={onSubmit}
      >
        <PromptInputAttachmentBridge onControlsReady={onAttachmentControlsReady} />
        <InterviewPromptAttachments />
        <PromptInputTextarea
          className="min-h-[60px]"
          disabled={status !== "ready"}
          onChange={onTextChange}
          placeholder={placeholder}
          value={input}
        />
        <PromptInputFooter>
          <TooltipProvider>
            <PromptInputTools>
              <PromptInputAttachButton />
            </PromptInputTools>
          </TooltipProvider>
          <InterviewPromptSubmit connected={connected} onStop={onStop} status={status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

function InterviewPromptSubmit({
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
        onClick={(event) => {
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
