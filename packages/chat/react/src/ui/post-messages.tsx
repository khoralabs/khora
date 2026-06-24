"use client";

import type { ChatStatus } from "ai";
import { createContext, type ReactNode, useContext, useMemo, useRef } from "react";
import type { DisplayMessage, DisplayToolCall } from "../adapters.ts";
import { formatPostTimestamp } from "../adapters.ts";
import { showAgentLoading } from "../hooks/use-agent-loading.ts";
import { scrollAnchorPostId, useThreadScrollPad } from "../hooks/use-thread-scroll-pad.ts";
import { Attachment, AttachmentPreview } from "./ai-elements/attachments.tsx";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/conversation.tsx";
import {
  Message,
  MessageContent,
  MessageHeader,
  MessageResponse,
  MessageTimestamp,
} from "./ai-elements/message.tsx";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "./ai-elements/tool.tsx";
import { MessageAttachments } from "./attachments-bridge.tsx";
import type { ChatAuthor } from "./author-avatar.tsx";
import { chatColumnClassName } from "./layout.ts";

type PostMessagesContextValue = {
  messages: DisplayMessage[];
  status: ChatStatus;
  showAgentLoading: boolean;
  loadingAuthor: ChatAuthor | null;
};

const PostMessagesContext = createContext<PostMessagesContextValue | null>(null);

function usePostMessagesContext() {
  const context = useContext(PostMessagesContext);
  if (!context) {
    throw new Error("PostMessages compound components must be used within PostMessages");
  }
  return context;
}

type PostMessageContextValue = {
  message: DisplayMessage;
};

const PostMessageContext = createContext<PostMessageContextValue | null>(null);

function usePostMessageContext() {
  const context = useContext(PostMessageContext);
  if (!context) {
    throw new Error("PostMessage compound components must be used within PostMessage");
  }
  return context;
}

export function PostMessages({
  messages,
  status,
  awaitingOpening = false,
  showAgentLoading: showAgentLoadingProp,
  loadingAuthor = null,
  className,
  children,
}: {
  messages: DisplayMessage[];
  status: ChatStatus;
  awaitingOpening?: boolean;
  showAgentLoading?: boolean;
  loadingAuthor?: ChatAuthor | null;
  className?: string;
  children?: ReactNode;
}) {
  const showLoading = showAgentLoadingProp ?? showAgentLoading(awaitingOpening, messages, status);
  const value = useMemo(
    () => ({ messages, status, showAgentLoading: showLoading, loadingAuthor }),
    [messages, status, showLoading, loadingAuthor],
  );

  return (
    <PostMessagesContext.Provider value={value}>
      <Conversation className={className ?? "flex-1"}>
        <ConversationContent className={chatColumnClassName}>
          {children ?? (
            <>
              {messages.map((message) => (
                <PostMessage key={message.id} message={message} />
              ))}
              <PostMessagesLoading />
              <PostMessagesScrollPad />
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </PostMessagesContext.Provider>
  );
}

export function PostMessage({
  message,
  children,
}: {
  message: DisplayMessage;
  children?: ReactNode;
}) {
  const value = useMemo(() => ({ message }), [message]);

  return (
    <PostMessageContext.Provider value={value}>
      <Message data-post-id={message.id} data-message-id={message.id} from={message.role}>
        {children ?? (
          <>
            <PostMessageHeader />
            <PostMessageAttachments />
            <PostMessageContent />
            <PostMessageTimestamp />
          </>
        )}
      </Message>
    </PostMessageContext.Provider>
  );
}

export function PostMessageHeader({ children }: { children?: ReactNode }) {
  const { message } = usePostMessageContext();
  if (children !== undefined) return <>{children}</>;
  return (
    <MessageHeader
      author={message.author}
      from={message.role}
      shimmer={message.role === "assistant" && message.status === "streaming"}
    />
  );
}

export function PostMessageAttachments({ children }: { children?: ReactNode }) {
  const { message } = usePostMessageContext();
  if (children !== undefined) return <>{children}</>;
  if (message.role !== "user" || (message.attachments?.length ?? 0) === 0) return null;
  return (
    <MessageAttachments attachments={message.attachments ?? []}>
      {(attachment) => (
        <a
          className="block shrink-0 rounded-lg"
          data-attachment-id={attachment.id}
          href={attachment.type === "file" ? attachment.url : undefined}
          rel="noreferrer"
          target="_blank"
        >
          <Attachment data={attachment}>
            <AttachmentPreview />
          </Attachment>
        </a>
      )}
    </MessageAttachments>
  );
}

export function PostMessageTools({ children }: { children?: ReactNode }) {
  const { message } = usePostMessageContext();
  if ((message.toolCalls?.length ?? 0) === 0) return null;
  if (children !== undefined) return <>{children}</>;
  return (
    <>
      {(message.toolCalls ?? []).map((toolCall) => (
        <DefaultToolCall key={toolCall.id} toolCall={toolCall} />
      ))}
    </>
  );
}

function DefaultToolCall({ toolCall }: { toolCall: DisplayToolCall }) {
  const state =
    toolCall.state === "completed"
      ? "output-available"
      : toolCall.state === "error"
        ? "output-error"
        : "input-available";

  return (
    <Tool defaultOpen={toolCall.state === "running"}>
      <ToolHeader state={state} title={toolCall.toolName} type={`tool-${toolCall.toolName}`} />
      <ToolContent>
        {toolCall.input !== undefined ? <ToolInput input={toolCall.input} /> : null}
        <ToolOutput errorText={toolCall.errorText} output={toolCall.output} />
      </ToolContent>
    </Tool>
  );
}

export function PostMessageContent({ children }: { children?: ReactNode }) {
  const { message } = usePostMessageContext();
  if (children !== undefined) return <MessageContent>{children}</MessageContent>;
  return (
    <MessageContent>
      <PostMessageTools />
      {message.content.length > 0 ? <MessageResponse>{message.content}</MessageResponse> : null}
    </MessageContent>
  );
}

export function PostMessageTimestamp({ children }: { children?: ReactNode }) {
  const { message } = usePostMessageContext();
  if (children !== undefined) return <>{children}</>;
  return <MessageTimestamp from={message.role} label={formatPostTimestamp(message.createdAtMs)} />;
}

export function PostMessagesEmpty({
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  const { messages } = usePostMessagesContext();
  if (messages.length > 0) return null;
  if (children !== undefined) return <>{children}</>;
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function PostMessagesLoading({ children }: { children?: ReactNode }) {
  const { showAgentLoading, loadingAuthor } = usePostMessagesContext();
  if (!showAgentLoading) return null;
  if (children !== undefined) return <>{children}</>;
  return (
    <Message data-agent-loading from="assistant">
      <MessageHeader author={loadingAuthor} from="assistant" shimmer />
    </Message>
  );
}

export function PostMessagesScrollPad() {
  const { messages, status, showAgentLoading } = usePostMessagesContext();
  const padRef = useRef<HTMLDivElement>(null);
  const anchorPostId = scrollAnchorPostId(messages, status);
  useThreadScrollPad(anchorPostId, showAgentLoading, padRef);

  return (
    <div
      ref={padRef}
      aria-hidden
      className="pointer-events-none shrink-0"
      data-chat-scroll-pad
      style={{ height: 0 }}
    />
  );
}

export { usePostMessageContext, usePostMessagesContext };
