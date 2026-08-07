import {
  createServiceReactMemoriesClient,
  GraphCameraReframeHint,
  GraphFetchError,
  GraphLoading,
  GraphNamespaceSearch,
  GraphNamespaceTree,
  GraphOverlayContainer,
  GraphPinnedEscHint,
  GraphPreviewDock,
  GraphProjectionProvider,
  GraphScene,
  GraphSearch,
  MemoriesClientProvider,
  MemoriesMemoryProvider,
  MemoriesNamespacesProvider,
} from "@khoralabs/memories-react-graph";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service/client";
import { useCallback, useEffect, useMemo, useState } from "react";

const MEMORIES_API_BASE = "/admin/api/memories";
const EMBEDDING_QUEUE_POLL_MS = 10_000;

/** Stable Domus database id — must match server `KHORA_DOMUS_MEMORIES_DATABASE_ID`. */
const DOMUS_DATABASE = { kind: "host", ownerKey: "khora" } as const;

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

function readNamespaceRoot(): string {
  if (typeof window === "undefined") return "global";
  const q = new URLSearchParams(window.location.search).get("namespaceRoot");
  return q?.trim() || "global";
}

export function GraphPage() {
  const namespaceRoot = useMemo(() => readNamespaceRoot(), []);
  const createClient = useCallback(
    (database: MemoriesDatabaseId) =>
      createServiceReactMemoriesClient({
        baseUrl: MEMORIES_API_BASE,
        database,
        namespaceRoot,
      }),
    [namespaceRoot],
  );
  const [memoriesAvailable, setMemoriesAvailable] = useState<boolean | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [embeddingQueue, setEmbeddingQueue] = useState<EmbeddingQueueStatus | null>(null);
  const [retryingQueue, setRetryingQueue] = useState(false);
  const [lastRetryResult, setLastRetryResult] = useState<string | null>(null);

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
    setLastRetryResult(null);
    try {
      const res = await fetch(`${MEMORIES_API_BASE}/embedding-queue/retry-now`, {
        method: "POST",
      });
      if (res.ok) {
        const json = (await res.json()) as {
          succeeded?: number;
          failed?: number;
          removedEmpty?: number;
          resetFailed?: number;
        };
        const parts: string[] = [];
        if (json.succeeded !== undefined) parts.push(`${json.succeeded} ok`);
        if (json.failed !== undefined) parts.push(`${json.failed} failed`);
        if (json.removedEmpty !== undefined && json.removedEmpty > 0) {
          parts.push(`${json.removedEmpty} empty removed`);
        }
        if (json.resetFailed !== undefined && json.resetFailed > 0) {
          parts.push(`${json.resetFailed} reset`);
        }
        if (parts.length > 0) setLastRetryResult(parts.join(", "));
      }
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
        const client = createServiceReactMemoriesClient({
          baseUrl: MEMORIES_API_BASE,
          database: DOMUS_DATABASE,
          namespaceRoot,
        });
        await client.listNamespaces();
        setMemoriesAvailable(true);
      } catch (e) {
        setMemoriesAvailable(false);
        const message = e instanceof Error ? e.message : String(e);
        if (/503|not configured/i.test(message)) {
          setUnavailableMessage("Memories database is not configured on this host.");
        } else {
          setUnavailableMessage(message);
        }
      }
    })();
  }, [namespaceRoot]);

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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <MemoriesClientProvider
        createClient={createClient}
        database={DOMUS_DATABASE}
        baseUrl={MEMORIES_API_BASE}
        openOnFocus
      >
        <MemoriesNamespacesProvider namespaceRoot={namespaceRoot}>
          <MemoriesMemoryProvider>
            <GraphProjectionProvider focusDelay={200}>
              <GraphScene
                edgeRenderMode="activeOnly"
                overlay={{ nodeLabelsVisible: true, edgeLabelsVisible: false }}
              >
                <GraphScene.TopLeft>
                  <div className="flex w-sm flex-col gap-4">
                    <GraphOverlayContainer>
                      <GraphNamespaceSearch />
                      <GraphNamespaceTree>
                        <GraphNamespaceTree.Label>Namespaces</GraphNamespaceTree.Label>
                        <GraphNamespaceTree.Hierarchy />
                      </GraphNamespaceTree>
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
                          {lastRetryResult !== null ? (
                            <div className="mt-1 text-[10px] text-foreground">
                              {lastRetryResult}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <GraphFetchError />
                    </GraphOverlayContainer>
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
            </GraphProjectionProvider>
          </MemoriesMemoryProvider>
        </MemoriesNamespacesProvider>
      </MemoriesClientProvider>
    </div>
  );
}
