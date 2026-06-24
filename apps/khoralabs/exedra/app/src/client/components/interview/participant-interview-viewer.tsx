import type { ScopeRef } from "@khoralabs/chat-core";
import type { DisplayMessage } from "@khoralabs/chat-react";
import { postsToDisplayMessages } from "@khoralabs/chat-react";
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
import type { BeliefFlag, ChatDocument, InterviewBootstrap } from "@/lib/interview-api";
import {
  extractBeliefsFromPosts,
  extractChatDocuments,
  fetchParticipantInterview,
} from "@/lib/interview-api";
import { appSectionHeaderClassName } from "@/shell/app-section-header";
import { SidebarCollapseTrigger } from "@/shell/sidebar-collapse-trigger";
import { SidebarSheetTrigger } from "@/shell/sidebar-sheet-trigger";

import type { InterviewScrollTarget } from "./use-scroll-to-message";
import { useScrollToMessage } from "./use-scroll-to-message";

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
        const beliefs = extractBeliefsFromPosts(data.posts.items, data.beliefFeedback ?? []);
        const resolveAuthor = (author: ScopeRef) => {
          if (author.type === "agent") return data.agent;
          if (author.type === "account" && author.id === participant.userId) {
            return {
              name: formatAccountDisplayName(participant),
              email: participant.email,
              avatarUrl: participant.avatarUrl,
            };
          }
          return null;
        };
        setMessages(
          postsToDisplayMessages(data.posts.items, {
            resolveAuthor,
            resolveAttachmentUrl: (attachment) =>
              sessionDocumentDownloadUrl(sessionId, attachment.id),
          }),
        );
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
  }, [sessionId, participant, onLoaded]);

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
