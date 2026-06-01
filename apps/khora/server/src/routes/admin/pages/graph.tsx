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
} from "@khoralabs/memories-react-graph";
import { useEffect, useState } from "react";

const MEMORIES_API_BASE = "/admin/api/memories";

function defaultNamespace(): string {
  if (typeof window === "undefined") return "global";
  const q = new URLSearchParams(window.location.search).get("namespace");
  return q?.trim() || "global";
}

export function GraphPage() {
  const [memoriesAvailable, setMemoriesAvailable] = useState<boolean | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${MEMORIES_API_BASE}/namespaces`);
        if (res.status === 503) {
          setMemoriesAvailable(false);
          setUnavailableMessage("Memories database is not configured on this host.");
          return;
        }
        if (!res.ok) {
          setMemoriesAvailable(false);
          const json = (await res.json()) as { error?: string };
          setUnavailableMessage(json.error ?? res.statusText);
          return;
        }
        setMemoriesAvailable(true);
      } catch (e) {
        setMemoriesAvailable(false);
        setUnavailableMessage(String(e));
      }
    })();
  }, []);

  if (memoriesAvailable === null) {
    return <p className="text-sm text-muted-foreground">Loading graph…</p>;
  }

  if (!memoriesAvailable) {
    return (
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Memories graph</h1>
        <p className="text-sm text-muted-foreground">
          {unavailableMessage ?? "Memories is not available on this host."}
        </p>
        <p className="text-xs text-muted-foreground">
          Ensure memories is enabled (default) and the host data directory contains a memories
          database, or set <code className="text-foreground">KHORA_MEMORIES=0</code> to disable.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background text-foreground">
      <GraphProjectionProvider
        apiBase={MEMORIES_API_BASE}
        namespace={defaultNamespace()}
        scope="subtree"
        focusDelay={200}
      >
        <GraphInvestigatorProvider>
          <GraphScene
            edgeRenderMode="activeOnly"
            overlay={{ nodeLabelsVisible: false, edgeLabelsVisible: false }}
          >
            <GraphScene.TopLeft>
              <div className="flex w-sm flex-col gap-4">
                <GraphOverlayContainer>
                  <GraphNamespaceSelector />
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
  );
}
