"use client";

import type { ChatStatus } from "ai";
import type { ReactNode, RefObject } from "react";
import { cn } from "#lib/utils.ts";
import type { DisplayMessage } from "../adapters.ts";
import { showAgentLoading } from "../hooks/use-agent-loading.ts";
import type { ChatAuthor } from "./author-avatar.tsx";
import { ChatDropOverlay } from "./drop-overlay.tsx";
import { PostMessages } from "./post-messages.tsx";
import { PromptComposer, type PromptInputMessage } from "./prompt-composer.tsx";

export function ChatThreadView({
  messages,
  status,
  connected,
  chatError,
  input,
  agentAuthor,
  awaitingOpening = false,
  showAgentLoading: showAgentLoadingProp,
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
  composerHeader,
  messagesChildren,
  composerChildren,
}: {
  messages: DisplayMessage[];
  status: ChatStatus;
  connected: boolean;
  chatError: string | null;
  input: string;
  agentAuthor: ChatAuthor | null;
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
  composerHeader?: ReactNode;
  messagesChildren?: ReactNode;
  composerChildren?: ReactNode;
}) {
  const agentLoading = showAgentLoadingProp ?? showAgentLoading(awaitingOpening, messages, status);

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        isDragActive && "select-none",
      )}
      ref={chatRootRef}
    >
      <ChatThreadDropOverlay active={isDragActive} />
      <ChatThreadMessages
        agentAuthor={agentAuthor}
        awaitingOpening={awaitingOpening}
        messages={messages}
        showAgentLoading={agentLoading}
        status={status}
      >
        {messagesChildren}
      </ChatThreadMessages>
      {canWrite ? (
        <ChatThreadComposer
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
          header={composerHeader}
        >
          {composerChildren}
        </ChatThreadComposer>
      ) : (
        <ChatThreadReadOnly message={readOnlyMessage} />
      )}
    </div>
  );
}

export function ChatThreadDropOverlay({ active }: { active: boolean }) {
  return <ChatDropOverlay active={active} />;
}

export function ChatThreadMessages({
  messages,
  status,
  awaitingOpening = false,
  showAgentLoading,
  agentAuthor,
  children,
}: {
  messages: DisplayMessage[];
  status: ChatStatus;
  awaitingOpening?: boolean;
  showAgentLoading?: boolean;
  agentAuthor: ChatAuthor | null;
  children?: ReactNode;
}) {
  return (
    <PostMessages
      awaitingOpening={awaitingOpening}
      loadingAuthor={agentAuthor}
      messages={messages}
      showAgentLoading={showAgentLoading}
      status={status}
    >
      {children}
    </PostMessages>
  );
}

export function ChatThreadComposer({
  connected,
  status,
  input,
  chatError,
  header,
  placeholder,
  onAttachmentControlsReady,
  onSubmit,
  onStop,
  onTextChange,
  onError,
  children,
}: {
  connected: boolean;
  status: ChatStatus;
  input: string;
  chatError: string | null;
  header?: ReactNode;
  placeholder: string;
  onAttachmentControlsReady: (controls: {
    add: (files: File[] | FileList) => void;
    clear: () => void;
  }) => void;
  onSubmit: (message: PromptInputMessage) => void;
  onStop: () => void;
  onTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onError: (error: string) => void;
  children?: ReactNode;
}) {
  return (
    <PromptComposer
      chatError={chatError}
      connected={connected}
      header={header}
      input={input}
      onAttachmentControlsReady={onAttachmentControlsReady}
      onError={onError}
      onStop={onStop}
      onSubmit={onSubmit}
      onTextChange={onTextChange}
      placeholder={placeholder}
      status={status}
    >
      {children}
    </PromptComposer>
  );
}

export function ChatThreadReadOnly({ message }: { message: string }) {
  return <div className="border-t px-4 py-3 text-sm text-muted-foreground">{message}</div>;
}
