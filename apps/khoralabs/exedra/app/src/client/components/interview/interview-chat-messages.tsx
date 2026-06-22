import type { MessageAuthor } from "@shared/messages/author";
import type { ChatStatus } from "ai";
import { useRef } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageHeader,
  MessageResponse,
  MessageTimestamp,
} from "@/components/ai-elements/message";
import type { ChatMessage } from "@/lib/interview-api";
import { formatMessageTimestamp } from "@/lib/interview-api";
import { interviewShowAgentLoading } from "./interview-agent-loading";
import { UserMessageAttachments } from "./interview-chat-attachments";
import { interviewChatColumnClassName } from "./interview-chat-layout";
import { interviewScrollAnchorMessageId, useInterviewScrollPad } from "./interview-scroll-pad";
import { InterviewToolCall } from "./interview-tool-call";

export { interviewShowAgentLoading };

type InterviewChatMessagesProps = {
  sessionId: string;
  messages: ChatMessage[];
  status: ChatStatus;
  showAgentLoading: boolean;
  agentAuthor: MessageAuthor | null;
};

function AgentLoadingMessage({ agentAuthor }: { agentAuthor: MessageAuthor | null }) {
  return (
    <Message from="assistant" data-agent-loading>
      <MessageHeader author={agentAuthor} from="assistant" shimmer />
    </Message>
  );
}

type InterviewConversationBodyProps = {
  sessionId: string;
  messages: ChatMessage[];
  status: ChatStatus;
  showAgentLoading: boolean;
  agentAuthor: MessageAuthor | null;
};

function InterviewConversationBody({
  sessionId,
  messages,
  status,
  showAgentLoading,
  agentAuthor,
}: InterviewConversationBodyProps) {
  const scrollPadRef = useRef<HTMLDivElement>(null);
  const anchorMessageId = interviewScrollAnchorMessageId(messages, status);
  useInterviewScrollPad(anchorMessageId, showAgentLoading, scrollPadRef);

  return (
    <>
      {messages.map((message) => (
        <Message from={message.role} key={message.id} data-message-id={message.id}>
          <MessageHeader author={message.author} from={message.role} />
          {message.role === "user" && (message.attachments?.length ?? 0) > 0 ? (
            <UserMessageAttachments
              attachments={message.attachments ?? []}
              sessionId={sessionId}
              ownerName={message.author?.name}
            />
          ) : null}
          <MessageContent>
            {(message.toolCalls ?? []).map((toolCall) => (
              <InterviewToolCall key={toolCall.id} toolCall={toolCall} />
            ))}
            {message.role === "assistant" && message.content.length > 0 ? (
              <MessageResponse>{message.content}</MessageResponse>
            ) : message.role === "user" && message.content.length > 0 ? (
              <MessageResponse>{message.content}</MessageResponse>
            ) : null}
          </MessageContent>
          <MessageTimestamp
            from={message.role}
            label={formatMessageTimestamp(message.createdAtMs)}
          />
        </Message>
      ))}
      {showAgentLoading ? <AgentLoadingMessage agentAuthor={agentAuthor} /> : null}
      <div
        ref={scrollPadRef}
        aria-hidden
        className="pointer-events-none shrink-0"
        data-interview-scroll-pad
        style={{ height: 0 }}
      />
    </>
  );
}

export function InterviewChatMessages({
  sessionId,
  messages,
  status,
  showAgentLoading,
  agentAuthor,
}: InterviewChatMessagesProps) {
  return (
    <Conversation className="flex-1">
      <ConversationContent className={interviewChatColumnClassName}>
        <InterviewConversationBody
          sessionId={sessionId}
          messages={messages}
          status={status}
          showAgentLoading={showAgentLoading}
          agentAuthor={agentAuthor}
        />
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
