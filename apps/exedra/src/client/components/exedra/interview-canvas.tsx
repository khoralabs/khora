import { Lightbulb } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BeliefFlag } from "@/lib/interview-api";
import type { SessionDetail } from "@/lib/sessions-api";

import { SessionParticipantsPanel } from "./session-participants-panel";

type InterviewCanvasProps = {
  sessionId: string | null;
  beliefs: BeliefFlag[];
  sessionDetail: SessionDetail | null;
  onRefreshDetail: () => void;
};

export function InterviewCanvas({
  sessionId,
  beliefs,
  sessionDetail,
  onRefreshDetail,
}: InterviewCanvasProps) {
  return (
    <div className="flex w-80 shrink-0 flex-col border-l bg-muted/20 xl:w-96">
      <Tabs defaultValue="context" className="flex h-full flex-col gap-0">
        <div className="border-b px-4 py-3">
          <TabsList variant="line">
            <TabsTrigger value="context">Context</TabsTrigger>
            <TabsTrigger value="beliefs">Beliefs</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="context" className="min-h-0 flex-1 overflow-y-auto p-4">
          {sessionId === null ? (
            <p className="text-sm text-muted-foreground">Select a session to view context.</p>
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
            <ul className="space-y-3">
              {beliefs.map((belief) => (
                <li
                  key={belief.id}
                  className="rounded-lg border bg-background px-4 py-3 text-sm leading-relaxed"
                >
                  {belief.belief}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
