import {
  GraphCameraReframeHint,
  GraphFetchError,
  GraphInvestigatorAnswerOverlay,
  GraphInvestigatorProvider,
  GraphLoading,
  GraphNamespaceSelector,
  GraphOverlayContainer,
  GraphPinnedEscHint,
  GraphPreviewDock,
  GraphProjectionProvider,
  GraphScene,
  GraphSearch,
} from "@cfd/memories-react-graph";
import { MenuIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible";

function defaultNamespace(): string {
  if (typeof window === "undefined") return "_global_";
  const q = new URLSearchParams(window.location.search).get("namespace");
  return q?.trim() || "_global_";
}

export function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <GraphProjectionProvider namespace={defaultNamespace()} focusDelay={200}>
        <GraphInvestigatorProvider>
          <GraphScene
            edgeRenderMode="activeOnly"
            overlay={{ nodeLabelsVisible: false, edgeLabelsVisible: false }}
          >
            <GraphScene.TopLeft>
              <div className="flex flex-col gap-4 w-sm">
                <Collapsible open={open} onOpenChange={setOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon">
                      {open ? <MenuIcon /> : <MenuIcon />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <GraphOverlayContainer>
                      <GraphNamespaceSelector />
                      <GraphSearch />
                      <GraphFetchError />
                    </GraphOverlayContainer>
                  </CollapsibleContent>
                </Collapsible>
                <GraphInvestigatorAnswerOverlay className="overflow-y-auto max-h-72" />
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
  );
}

export default App;
