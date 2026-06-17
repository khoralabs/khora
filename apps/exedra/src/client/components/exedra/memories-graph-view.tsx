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
} from "@khoralabs/memories-react-graph";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CompactChromeHeader } from "@/shell/compact-chrome-header";

type MemoriesGraphViewProps = {
  apiBase: string;
  namespace: string;
  title?: string;
  onBack?: () => void;
  headerExtra?: ReactNode;
};

export function MemoriesGraphView({
  apiBase,
  namespace,
  title,
  onBack,
  headerExtra,
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
