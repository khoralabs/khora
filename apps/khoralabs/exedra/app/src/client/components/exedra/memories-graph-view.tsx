import {
  GraphCameraReframeHint,
  GraphFetchError,
  GraphLoading,
  GraphOverlayContainer,
  GraphPinnedEscHint,
  GraphPreviewDock,
  GraphProjectionProvider,
  GraphScene,
  useMemoriesGraphChrome,
} from "@khoralabs/memories-react-graph";
import { ArrowLeft, Network } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { ContributeKnowledgeOverlayButton } from "@/components/exedra/contribute-knowledge-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CompactChromeHeader } from "@/shell/compact-chrome-header";

type MemoriesGraphViewProps = {
  apiBase: string;
  namespace: string;
  orgId?: string;
  teamId?: string;
  sessionId?: string;
  title?: string;
  onBack?: () => void;
  headerExtra?: ReactNode;
  emptyDescription?: string;
  canContribute?: boolean;
};

function MemoriesGraphEmpty({ description }: { description: string }) {
  const { graphLoading, graphError, graphSummary } = useMemoriesGraphChrome();
  if (graphLoading || graphError !== null) return null;
  if (!graphSummary.startsWith("0 nodes")) return null;

  return (
    <Empty className="max-w-md">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Network />
        </EmptyMedia>
        <EmptyTitle>No memories yet</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function MemoriesGraphView({
  apiBase,
  namespace,
  orgId,
  teamId,
  sessionId,
  title,
  onBack,
  headerExtra,
  emptyDescription = "Memories from interviews will appear here as they're captured.",
  canContribute = true,
}: MemoriesGraphViewProps) {
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {title !== undefined || onBack !== undefined || headerExtra !== undefined ? (
        <CompactChromeHeader
          title={title}
          leading={
            onBack !== undefined ? (
              <Button
                aria-label="Back"
                onClick={onBack}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ArrowLeft />
              </Button>
            ) : undefined
          }
        >
          {headerExtra}
        </CompactChromeHeader>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <GraphProjectionProvider
          key={graphRefreshKey}
          apiBase={apiBase}
          focusDelay={200}
          namespace={namespace}
          scope="subtree"
        >
          <GraphScene
            edgeRenderMode="activeOnly"
            overlay={{ nodeLabelsVisible: true, edgeLabelsVisible: false }}
          >
            <GraphScene.TopLeft>
              <div className="flex w-sm flex-col gap-4">
                <GraphOverlayContainer>
                  <GraphFetchError />
                </GraphOverlayContainer>
                <GraphOverlayContainer>
                  <ContributeKnowledgeOverlayButton
                    namespace={namespace}
                    orgId={orgId}
                    teamId={teamId}
                    sessionId={sessionId}
                    canContribute={canContribute}
                    onContributed={() => setGraphRefreshKey((key) => key + 1)}
                  />
                </GraphOverlayContainer>
              </div>
            </GraphScene.TopLeft>
            <GraphScene.Center>
              <GraphLoading />
              <MemoriesGraphEmpty description={emptyDescription} />
            </GraphScene.Center>
            <GraphScene.TopRight>
              <div className="flex items-center justify-end gap-2">
                <GraphCameraReframeHint />
                <GraphPinnedEscHint />
              </div>
            </GraphScene.TopRight>
            <GraphScene.BottomRight>
              <GraphPreviewDock />
            </GraphScene.BottomRight>
          </GraphScene>
        </GraphProjectionProvider>
      </div>
    </div>
  );
}
