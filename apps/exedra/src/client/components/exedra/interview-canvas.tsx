import { Lightbulb } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ItemGroup } from "@/components/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BeliefFeedback, BeliefFlag } from "@/lib/interview-api";
import type { SessionDetail } from "@/lib/sessions-api";
import { cn } from "@/lib/utils";
import { appSectionHeaderClassName } from "@/shell/app-section-header";

import { BeliefItem } from "./belief-item";
import { SessionParticipantsPanel } from "./session-participants-panel";

type InterviewCanvasProps = {
  sessionId: string | null;
  beliefs: BeliefFlag[];
  sessionDetail: SessionDetail | null;
  onRefreshDetail: () => void;
  onBeliefUpdate: (id: string, update: { feedback?: BeliefFeedback; correction?: string }) => void;
  onBeliefSourceClick: (sourceMessageId: string) => void;
  sheetMode?: boolean;
};

export function InterviewCanvas({
  sessionId,
  beliefs,
  sessionDetail,
  onRefreshDetail,
  onBeliefUpdate,
  onBeliefSourceClick,
  sheetMode = false,
}: InterviewCanvasProps) {
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
            <TabsTrigger value="info">Session Info</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="info" className="min-h-0 flex-1 overflow-y-auto p-4">
          {sessionId === null ? (
            <p className="text-sm text-muted-foreground">Select a session to view details.</p>
          ) : (
            <SessionParticipantsPanel
              detail={sessionDetail}
              sessionId={sessionId}
              onRefresh={onRefreshDetail}
            />
          )}
        </TabsContent>

        <TabsContent value="beliefs" className="min-h-0 flex-1 overflow-y-auto p-4">
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
            <ItemGroup className="gap-3">
              {beliefs.map((belief) => (
                <BeliefItem
                  belief={belief}
                  key={belief.id}
                  onSourceClick={onBeliefSourceClick}
                  onUpdate={onBeliefUpdate}
                />
              ))}
            </ItemGroup>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
