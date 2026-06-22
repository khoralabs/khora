import type { AccountProfile } from "@shared/accounts/row";
import { Lightbulb, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CollapsibleItemGroup } from "@/components/ui/collapsible-item-group";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BeliefFeedback, BeliefFlag, InterviewCompletion } from "@/lib/interview-api";
import { createSession, type SessionDetail } from "@/lib/sessions-api";
import { cn } from "@/lib/utils";
import { appSectionHeaderClassName } from "@/shell/app-section-header";
import { BeliefItem } from "./belief-item";
import { SessionAccessPanel } from "./session-access-panel";

function isReviewedBelief(belief: BeliefFlag): boolean {
  return belief.feedback === "confirmed" || belief.feedback === "corrected";
}

type BeliefListProps = {
  beliefs: BeliefFlag[];
  beliefsReadOnly: boolean;
  onBeliefSourceClick: (sourceMessageId: string) => void;
  onBeliefUpdate: (id: string, update: { feedback?: BeliefFeedback; correction?: string }) => void;
};

function BeliefList({
  beliefs,
  beliefsReadOnly,
  onBeliefSourceClick,
  onBeliefUpdate,
}: BeliefListProps) {
  return (
    <CollapsibleItemGroup.ItemGroup className="gap-3">
      {beliefs.map((belief) => (
        <BeliefItem
          belief={belief}
          key={belief.id}
          readOnly={beliefsReadOnly}
          onSourceClick={onBeliefSourceClick}
          onUpdate={onBeliefUpdate}
        />
      ))}
    </CollapsibleItemGroup.ItemGroup>
  );
}

type InterviewCanvasProps = {
  sessionId: string | null;
  teamId: string | null;
  beliefs: BeliefFlag[];
  completion: InterviewCompletion | null;
  sessionDetail: SessionDetail | null;
  onRefreshDetail: () => void;
  onBeliefUpdate: (id: string, update: { feedback?: BeliefFeedback; correction?: string }) => void;
  onBeliefSourceClick: (sourceMessageId: string) => void;
  onNavigate: (path: string) => void;
  sheetMode?: boolean;
  canViewParticipantChats?: boolean;
  viewingParticipantUserId?: string | null;
  onViewParticipantChat?: (participant: AccountProfile) => void;
  beliefsReadOnly?: boolean;
};

export function InterviewCanvas({
  sessionId,
  teamId,
  beliefs,
  completion,
  sessionDetail,
  onRefreshDetail,
  onBeliefUpdate,
  onBeliefSourceClick,
  onNavigate,
  sheetMode = false,
  canViewParticipantChats = false,
  viewingParticipantUserId = null,
  onViewParticipantChat,
  beliefsReadOnly = false,
}: InterviewCanvasProps) {
  const [creatingTopic, setCreatingTopic] = useState<string | null>(null);
  const resolvedTeamId = teamId ?? sessionDetail?.session.teamId ?? null;
  const followUpOptions = completion?.nextSessionOptions ?? [];
  const unconfirmedBeliefs = beliefs.filter((belief) => !isReviewedBelief(belief));
  const confirmedBeliefs = beliefs.filter(isReviewedBelief);

  async function handleFollowUpSession(topic: string) {
    if (resolvedTeamId === null || creatingTopic !== null) return;
    setCreatingTopic(topic);
    try {
      const result = await createSession({ teamId: resolvedTeamId, topic });
      window.location.href = `/sessions/${result.session.id}/interview`;
    } catch {
      setCreatingTopic(null);
    }
  }

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col bg-muted/20",
        sheetMode ? "h-full min-h-0" : "hidden w-80 border-l lg:flex xl:w-96",
      )}
    >
      <Tabs defaultValue="beliefs" className="flex h-full flex-col gap-0">
        <div className={appSectionHeaderClassName("px-4")}>
          <TabsList variant="line">
            <TabsTrigger value="beliefs">Beliefs</TabsTrigger>
            <TabsTrigger value="info">Details</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="info" className="min-h-0 flex-1 overflow-y-auto p-4">
          {sessionId === null ? (
            <p className="text-sm text-muted-foreground">Select a session to view details.</p>
          ) : (
            <SessionAccessPanel
              detail={sessionDetail}
              sessionId={sessionId}
              onRefresh={onRefreshDetail}
              onNavigate={onNavigate}
              canViewParticipantChats={canViewParticipantChats}
              viewingParticipantUserId={viewingParticipantUserId}
              onViewParticipantChat={onViewParticipantChat}
            />
          )}
        </TabsContent>

        <TabsContent value="beliefs" className="min-h-0 flex-1 overflow-y-auto p-4">
          {followUpOptions.length > 0 ? (
            <div className="mb-4 space-y-2 rounded-lg border bg-background/80 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4 text-muted-foreground" />
                Suggested follow-up sessions
              </div>
              <div className="flex flex-col gap-2">
                {followUpOptions.map((topic) => (
                  <Button
                    key={topic}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto justify-start whitespace-normal py-2 text-left"
                    disabled={resolvedTeamId === null || creatingTopic !== null}
                    onClick={() => void handleFollowUpSession(topic)}
                  >
                    {creatingTopic === topic ? "Creating…" : topic}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {beliefs.length === 0 ? (
            <Empty className="border border-dashed bg-background/50">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Lightbulb />
                </EmptyMedia>
                <EmptyTitle>No beliefs flagged yet</EmptyTitle>
                <EmptyDescription>
                  As you share your perspective, the interviewer will surface beliefs here for you
                  to confirm or refine.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-4">
              {unconfirmedBeliefs.length > 0 ? (
                <CollapsibleItemGroup defaultOpen itemCount={unconfirmedBeliefs.length}>
                  <CollapsibleItemGroup.Title>Unconfirmed</CollapsibleItemGroup.Title>
                  <CollapsibleItemGroup.Content>
                    <BeliefList
                      beliefs={unconfirmedBeliefs}
                      beliefsReadOnly={beliefsReadOnly}
                      onBeliefSourceClick={onBeliefSourceClick}
                      onBeliefUpdate={onBeliefUpdate}
                    />
                  </CollapsibleItemGroup.Content>
                </CollapsibleItemGroup>
              ) : null}
              {confirmedBeliefs.length > 0 ? (
                <CollapsibleItemGroup defaultOpen={false} itemCount={confirmedBeliefs.length}>
                  <CollapsibleItemGroup.Title>Confirmed</CollapsibleItemGroup.Title>
                  <CollapsibleItemGroup.Content>
                    <BeliefList
                      beliefs={confirmedBeliefs}
                      beliefsReadOnly={beliefsReadOnly}
                      onBeliefSourceClick={onBeliefSourceClick}
                      onBeliefUpdate={onBeliefUpdate}
                    />
                  </CollapsibleItemGroup.Content>
                </CollapsibleItemGroup>
              ) : null}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
