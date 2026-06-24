import type { DisplayMessage } from "@khoralabs/chat-react";
import { extractTextFromParts, extractToolCallsFromParts } from "@khoralabs/chat-react";
import { PostMessages } from "@khoralabs/chat-react/ui";
import type { AccountProfile } from "@shared/accounts/row";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { SessionViewToggle } from "@/components/exedra/session-view-toggle";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { formatAccountDisplayName } from "@/lib/account-display";
import { sessionDocumentDownloadUrl } from "@/lib/documents-api";
import type {
  BeliefFlag,
  ChatDocument,
  InterviewBootstrap,
  SerializedMessage,
} from "@/lib/interview-api";
import {
  extractBeliefsFromMessages,
  extractChatDocuments,
  fetchParticipantInterview,
} from "@/lib/interview-api";
import { appSectionHeaderClassName } from "@/shell/app-section-header";
import { SidebarCollapseTrigger } from "@/shell/sidebar-collapse-trigger";
import { SidebarSheetTrigger } from "@/shell/sidebar-sheet-trigger";

import type { InterviewScrollTarget } from "./use-scroll-to-message";
import { useScrollToMessage } from "./use-scroll-to-message";

function toDisplayMessages(messages: SerializedMessage[], sessionId: string): DisplayMessage[] {
  return messages
    .filter((message) => {
      if (message.role !== "user" && message.role !== "assistant") return false;
      const metadata = message.metadata as { kickoff?: boolean } | undefined;
      return metadata?.kickoff !== true;
    })
    .map((message): DisplayMessage => {
      const metadata = message.metadata as
        | {
            displayText?: string;
            documents?: Array<{
              id: string;
              fileName: string;
              mimeType?: string;
              mediaType?: string;
              byteSize?: number;
            }>;
          }
        | undefined;
      return {
        id: message.id,
        role: message.role as "user" | "assistant",
        content:
          typeof metadata?.displayText === "string"
            ? metadata.displayText
            : extractTextFromParts(message.parts),
        createdAtMs: message.createdAtMs,
        author: message.author,
        attachments: metadata?.documents?.map((document) => ({
          id: document.id,
          fileName: document.fileName,
          mediaType: document.mimeType ?? document.mediaType,
          byteSize: document.byteSize,
          url: sessionDocumentDownloadUrl(sessionId, document.id),
        })),
        toolCalls: extractToolCallsFromParts(message.parts),
      };
    })
    .filter(
      (message) =>
        message.content.length > 0 ||
        (message.attachments?.length ?? 0) > 0 ||
        (message.toolCalls?.length ?? 0) > 0,
    );
}

type ParticipantInterviewViewerProps = {
  sessionId: string;
  participant: AccountProfile;
  onBack: () => void;
  onNavigate: (path: string) => void;
  scrollToTarget?: InterviewScrollTarget | null;
  onScrollToMessageComplete?: () => void;
  onLoaded: (data: {
    beliefs: BeliefFlag[];
    completion: InterviewBootstrap["completion"] | null;
  }) => void;
  onChatDocumentsChange?: (documents: ChatDocument[]) => void;
};

export function ParticipantInterviewViewer({
  sessionId,
  participant,
  onBack,
  onNavigate,
  scrollToTarget,
  onScrollToMessageComplete,
  onLoaded,
  onChatDocumentsChange,
}: ParticipantInterviewViewerProps) {
  const [messages, setMessages] = useState<DisplayMessage[] | null>(null);
  const [agentAuthor, setAgentAuthor] = useState<InterviewBootstrap["agent"]>(null);
  const [error, setError] = useState<string | null>(null);
  const participantName = formatAccountDisplayName(participant);

  useScrollToMessage(scrollToTarget, onScrollToMessageComplete, messages !== null);

  useEffect(() => {
    if (messages === null) {
      onChatDocumentsChange?.([]);
      return;
    }
    onChatDocumentsChange?.(extractChatDocuments(messages));
  }, [messages, onChatDocumentsChange]);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setError(null);

    void fetchParticipantInterview(sessionId, participant.userId)
      .then((data) => {
        if (cancelled) return;
        const beliefs = extractBeliefsFromMessages(data.messages, data.beliefFeedback ?? []);
        setMessages(toDisplayMessages(data.messages, sessionId));
        setAgentAuthor(data.agent);
        onLoaded({ beliefs, completion: data.completion ?? null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load interview");
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, participant.userId, onLoaded]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className={appSectionHeaderClassName("gap-2 px-3 lg:gap-3 lg:px-4")}>
        <SidebarSheetTrigger />
        <SidebarCollapseTrigger />
        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {participantName}&apos;s interview
        </p>
        <div className="shrink-0">
          <SessionViewToggle activeView="chat" onNavigate={onNavigate} sessionId={sessionId} />
        </div>
      </div>

      {error !== null ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : messages === null ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Interview not started</EmptyTitle>
              <EmptyDescription>
                {participantName} has not sent any messages in this session yet.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <PostMessages
          messages={messages}
          status="ready"
          showAgentLoading={false}
          loadingAuthor={agentAuthor}
        />
      )}
    </div>
  );
}
