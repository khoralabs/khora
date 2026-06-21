import {
  GraphCameraReframeHint,
  GraphFetchError,
  GraphInvestigatorAnswerOverlay,
  GraphInvestigatorProvider,
  GraphLoading,
  GraphOverlayContainer,
  GraphPinnedEscHint,
  GraphPreviewDock,
  GraphProjectionProvider,
  GraphScene,
  GraphSearch,
  useGraphInvestigator,
  useMemoriesGraphChrome,
} from "@khoralabs/memories-react-graph";
import { ArrowLeft, Network } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

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
  title?: string;
  onBack?: () => void;
  headerExtra?: ReactNode;
  emptyDescription?: string;
  onInvestigated?: () => void;
};

function GraphInvestigatorTracker({ onInvestigated }: { onInvestigated?: () => void }) {
  const { loading } = useGraphInvestigator();
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    if (loading && !wasLoadingRef.current) {
      onInvestigated?.();
    }
    wasLoadingRef.current = loading;
  }, [loading, onInvestigated]);

  return null;
}

function MemoriesGraphEmpty({ description }: { description: string }) {
  const { graphLoading, graphError, graphSummary } = useMemoriesGraphChrome();
  if (graphLoading || graphError !== null) return null;
  if (!graphSummary.startsWith("0 nodes")) return null;

  return (
    <Empty className="max-w-md border border-solid bg-background/95 backdrop-blur-sm">
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
  title,
  onBack,
  headerExtra,
  emptyDescription = "Memories from interviews will appear here as they're captured.",
  onInvestigated,
}: MemoriesGraphViewProps) {
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
          apiBase={apiBase}
          focusDelay={200}
          namespace={namespace}
          scope="subtree"
        >
          <GraphInvestigatorProvider>
            <GraphInvestigatorTracker onInvestigated={onInvestigated} />
            <GraphScene
              edgeRenderMode="activeOnly"
              overlay={{ nodeLabelsVisible: true, edgeLabelsVisible: false }}
            >
              <GraphScene.TopLeft>
                <div className="flex w-sm flex-col gap-4">
                  <GraphOverlayContainer>
                    <GraphSearch />
                    <GraphFetchError />
                  </GraphOverlayContainer>
                  <GraphInvestigatorAnswerOverlay className="max-h-72 overflow-y-auto" />
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
          </GraphInvestigatorProvider>
        </GraphProjectionProvider>
      </div>
    </div>
  );
}
