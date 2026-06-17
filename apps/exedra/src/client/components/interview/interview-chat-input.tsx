import type { ChatStatus } from "ai";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { TooltipProvider } from "@/components/ui/tooltip";

import {
  InterviewPromptAttachments,
  PromptInputAttachmentBridge,
} from "./interview-chat-attachments";

type InterviewChatInputProps = {
  connected: boolean;
  status: ChatStatus;
  input: string;
  chatError: string | null;
  onAttachmentAddReady: (add: (files: File[] | FileList) => void) => void;
  onSubmit: (message: PromptInputMessage) => void;
  onTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onError: (error: string) => void;
};

export function InterviewChatInput({
  connected,
  status,
  input,
  chatError,
  onAttachmentAddReady,
  onSubmit,
  onTextChange,
  onError,
}: InterviewChatInputProps) {
  return (
    <div className="border-t p-4">
      {chatError !== null ? <p className="mb-3 text-sm text-destructive">{chatError}</p> : null}
      <PromptInput
        className="relative mx-auto w-full max-w-2xl"
        maxFileSize={25 * 1024 * 1024}
        multiple
        onError={(error) => onError(error.message)}
        onSubmit={onSubmit}
      >
        <PromptInputAttachmentBridge onAddReady={onAttachmentAddReady} />
        <InterviewPromptAttachments />
        <PromptInputTextarea
          className="min-h-[60px]"
          disabled={status !== "ready" || !connected}
          onChange={onTextChange}
          placeholder="Share your thoughts…"
          value={input}
        />
        <PromptInputFooter>
          <TooltipProvider>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger tooltip="Add attachments" />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments label="Upload file" />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
          </TooltipProvider>
          <PromptInputSubmit disabled={!connected || status !== "ready"} status={status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
