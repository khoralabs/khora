import {
  GraphCameraReframeHint,
  GraphFetchError,
  GraphLoading,
  GraphNamespaceSelector,
  GraphOverlayContainer,
  GraphPinnedEscHint,
  GraphPreviewDock,
  GraphProjectionProvider,
  GraphScene,
  GraphSearch,
} from "@cfd/memories-react-graph";

function defaultNamespace(): string {
  if (typeof window === "undefined") return "_global_";
  const q = new URLSearchParams(window.location.search).get("namespace");
  return q?.trim() || "_global_";
}

export function App() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <GraphProjectionProvider namespace={defaultNamespace()} focusDelay={200}>
        <GraphScene
          edgeRenderMode="activeOnly"
          overlay={{ nodeLabelsVisible: false, edgeLabelsVisible: false }}
        >
          <GraphScene.TopLeft>
            <GraphOverlayContainer className="w-sm">
              <GraphNamespaceSelector />
              <GraphSearch />
              <GraphFetchError />
            </GraphOverlayContainer>
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
      </GraphProjectionProvider>
    </div>
  );
}

export default App;
