import type { ChatStatus } from "ai";
import type { RefObject } from "react";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { MessageAuthor } from "@shared/messages/author";

import type { ChatMessage } from "@/lib/interview-api";
import { cn } from "@/lib/utils";

import { interviewShowAgentLoading } from "./interview-agent-loading";
import { InterviewChatDropOverlay } from "./interview-chat-drop-overlay";
import { InterviewChatInput } from "./interview-chat-input";
import { InterviewChatMessages } from "./interview-chat-messages";

type ThreadChatViewProps = {
  sessionId: string;
  messages: ChatMessage[];
  status: ChatStatus;
  connected: boolean;
  chatError: string | null;
  input: string;
  agentAuthor: MessageAuthor | null;
  awaitingOpening?: boolean;
  showAgentLoading?: boolean;
  canWrite: boolean;
  readOnlyMessage?: string;
  placeholder: string;
  chatRootRef?: RefObject<HTMLDivElement | null>;
  isDragActive?: boolean;
  onAttachmentControlsReady: (controls: {
    add: (files: File[] | FileList) => void;
    clear: () => void;
  }) => void;
  onSubmit: (message: PromptInputMessage) => void;
  onStop: () => void;
  onTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onError: (error: string) => void;
};

export function ThreadChatView({
  sessionId,
  messages,
  status,
  connected,
  chatError,
  input,
  agentAuthor,
  awaitingOpening = false,
  showAgentLoading,
  canWrite,
  readOnlyMessage = "Read-only access",
  placeholder,
  chatRootRef,
  isDragActive = false,
  onAttachmentControlsReady,
  onSubmit,
  onStop,
  onTextChange,
  onError,
}: ThreadChatViewProps) {
  const agentLoading =
    showAgentLoading ?? interviewShowAgentLoading(awaitingOpening, messages, status);

  return (
    <div
      className={cn("relative flex min-w-0 flex-1 flex-col", isDragActive && "select-none")}
      ref={chatRootRef}
    >
      <InterviewChatDropOverlay active={isDragActive} />
      <InterviewChatMessages
        agentAuthor={agentAuthor}
        messages={messages}
        sessionId={sessionId}
        showAgentLoading={agentLoading}
        status={status}
      />
      {canWrite ? (
        <InterviewChatInput
          chatError={chatError}
          connected={connected}
          input={input}
          onAttachmentControlsReady={onAttachmentControlsReady}
          onError={onError}
          onStop={onStop}
          onSubmit={onSubmit}
          onTextChange={onTextChange}
          placeholder={placeholder}
          status={status}
        />
      ) : (
        <div className="border-t px-4 py-3 text-sm text-muted-foreground">{readOnlyMessage}</div>
      )}
    </div>
  );
}
