import type { MessageAuthor } from "@shared/messages/author";
import type { ChatStatus } from "ai";
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
import { Spinner } from "@/components/ui/spinner";
import type { ChatMessage } from "@/lib/interview-api";
import { formatMessageTimestamp } from "@/lib/interview-api";

import { UserMessageAttachments } from "./interview-chat-attachments";
import { InterviewToolCall } from "./interview-tool-call";

type InterviewChatMessagesProps = {
  sessionId: string;
  messages: ChatMessage[];
  showThinking: boolean;
  agentAuthor: MessageAuthor | null;
};

export function InterviewChatMessages({
  sessionId,
  messages,
  showThinking,
  agentAuthor,
}: InterviewChatMessagesProps) {
  return (
    <Conversation className="flex-1">
      <ConversationContent>
        {messages.map((message) => (
          <Message from={message.role} key={message.id}>
            <MessageHeader author={message.author} from={message.role} />
            <MessageContent data-message-id={message.id}>
              {(message.toolCalls ?? []).map((toolCall) => (
                <InterviewToolCall key={toolCall.id} toolCall={toolCall} />
              ))}
              {message.role === "assistant" && message.content.length > 0 ? (
                <MessageResponse>{message.content}</MessageResponse>
              ) : message.role === "user" ? (
                <>
                  {message.attachments !== undefined ? (
                    <UserMessageAttachments
                      attachments={message.attachments}
                      sessionId={sessionId}
                    />
                  ) : null}
                  {message.content.length > 0 ? message.content : null}
                </>
              ) : null}
            </MessageContent>
            <MessageTimestamp
              from={message.role}
              label={formatMessageTimestamp(message.createdAtMs)}
            />
          </Message>
        ))}
        {showThinking && messages.every((message) => message.role !== "assistant") ? (
          <Message from="assistant">
            <MessageHeader author={agentAuthor} from="assistant" />
            <MessageContent>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Spinner />
                Preparing your interview…
              </p>
            </MessageContent>
          </Message>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

export function interviewShowThinking(
  awaitingOpening: boolean,
  messages: ChatMessage[],
  status: ChatStatus,
): boolean {
  return (
    (awaitingOpening && messages.length === 0) || status === "submitted" || status === "streaming"
  );
}
