import { useEffect, useState } from "react";
import { useProjection } from "./use-projection.js";

export function MemoryHoverPreview() {
  const {
    namespace,
    liveHoveredEntryId,
    onMemoryPreviewPointerEnter,
    onMemoryPreviewPointerLeave,
  } = useProjection();

  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!liveHoveredEntryId) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    const key = liveHoveredEntryId;
    setLoading(true);
    setPreview(null);
    void fetch(
      `/api/memory-preview?namespace=${encodeURIComponent(namespace)}&key=${encodeURIComponent(key)}`,
      { signal: ac.signal },
    )
      .then((res) => res.json() as Promise<{ preview?: string | null; error?: string }>)
      .then((json) => {
        if (!ac.signal.aborted) setPreview(json.preview ?? null);
      })
      .catch(() => {
        if (!ac.signal.aborted) setPreview(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [liveHoveredEntryId, namespace]);

  if (!liveHoveredEntryId) return null;

  return (
    <section
      aria-label="Memory source preview"
      className="app-chrome pointer-events-auto fixed bottom-4 right-4 z-30 flex max-h-[min(50vh,420px)] w-[min(28rem,calc(100vw-2rem))] flex-col rounded-lg border border-border/60 bg-background/95 p-3 text-left shadow-lg backdrop-blur-md"
      onPointerEnter={onMemoryPreviewPointerEnter}
      onPointerLeave={onMemoryPreviewPointerLeave}
    >
      <div className="mb-1 font-mono text-[10px] text-muted-foreground">
        {namespace} <span className="text-foreground">·</span>{" "}
        <span className="text-foreground">{liveHoveredEntryId}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-foreground">
        {loading ? (
          <span className="text-muted-foreground">Loading…</span>
        ) : preview ? (
          <pre className="whitespace-pre-wrap break-words font-mono">{preview}</pre>
        ) : (
          <span className="text-muted-foreground">No text content for this memory.</span>
        )}
      </div>
    </section>
  );
}
