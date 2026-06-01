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
import { useCallback, useEffect, useState } from "react";

const MEMORIES_API_BASE = "/admin/api/memories";
const EMBEDDING_QUEUE_POLL_MS = 10_000;

type EmbeddingQueueStatus = {
  pending: number;
  failed: number;
  rows: Array<{
    id: number;
    namespace: string;
    memoryKey: string;
    attempts: number;
    lastAttemptAt: number | null;
    createdAt: number;
  }>;
};

function defaultNamespace(): string {
  if (typeof window === "undefined") return "global";
  const q = new URLSearchParams(window.location.search).get("namespace");
  return q?.trim() || "global";
}

export function GraphPage() {
  const [memoriesAvailable, setMemoriesAvailable] = useState<boolean | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [embeddingQueue, setEmbeddingQueue] = useState<EmbeddingQueueStatus | null>(null);
  const [retryingQueue, setRetryingQueue] = useState(false);

  const loadQueue = useCallback(async (stoppedRef?: { stopped: boolean }) => {
    try {
      const res = await fetch(`${MEMORIES_API_BASE}/embedding-queue`);
      if (!res.ok) return;
      const json = (await res.json()) as EmbeddingQueueStatus;
      if (!stoppedRef?.stopped) setEmbeddingQueue(json);
    } catch {
      // best effort status panel
    }
  }, []);

  const retryNow = useCallback(async () => {
    setRetryingQueue(true);
    try {
      await fetch(`${MEMORIES_API_BASE}/embedding-queue/retry-now`, { method: "POST" });
      await loadQueue();
    } finally {
      setRetryingQueue(false);
    }
  }, [loadQueue]);

  useEffect(() => {
    if (!memoriesAvailable) return;
    const stoppedRef = { stopped: false };
    void loadQueue();
    const id = window.setInterval(() => {
      void loadQueue(stoppedRef);
    }, EMBEDDING_QUEUE_POLL_MS);
    return () => {
      stoppedRef.stopped = true;
      window.clearInterval(id);
    };
  }, [memoriesAvailable, loadQueue]);

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
                  {embeddingQueue !== null ? (
                    <div className="rounded border p-2 text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">Embedding queue</div>
                      <div>{embeddingQueue.pending} pending</div>
                      <div>{embeddingQueue.failed} failed</div>
                      <button
                        type="button"
                        className="mt-2 rounded border px-2 py-1 text-xs text-foreground disabled:opacity-50"
                        onClick={() => void retryNow()}
                        disabled={retryingQueue}
                      >
                        {retryingQueue ? "Retrying..." : "Retry now"}
                      </button>
                    </div>
                  ) : null}
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
