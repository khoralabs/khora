import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectionPoint } from "./projection-types.js";
import { useProjection } from "./use-projection.js";

export function NodePreviewCard({ point, open }: { point: ProjectionPoint; open: boolean }) {
  const { namespace, onMemoryPreviewPointerEnter, onMemoryPreviewPointerLeave } = useProjection();

  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    const key = point.entryId;
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
  }, [open, namespace, point.entryId]);

  if (!open) return null;

  return (
    <Card
      aria-label="Memory preview"
      className="app-chrome w-full max-h-[min(50vh,420px)] gap-0 border-border/60 bg-background/95 py-3 text-left shadow-lg backdrop-blur-md"
      onPointerEnter={onMemoryPreviewPointerEnter}
      onPointerLeave={onMemoryPreviewPointerLeave}
    >
      <CardHeader className="gap-1 px-3 pb-2 pt-0">
        <CardTitle className="font-mono text-[10px] font-normal leading-tight text-muted-foreground">
          {namespace} <span className="text-foreground">·</span>{" "}
          <span className="text-foreground">{point.entryId}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-0 pt-0">
        <Tabs defaultValue="content" className="gap-2">
          <TabsList className="h-8 w-full">
            <TabsTrigger value="content" className="text-xs">
              Content
            </TabsTrigger>
            <TabsTrigger value="properties" className="text-xs">
              Properties
            </TabsTrigger>
          </TabsList>
          <TabsContent value="content" className="max-h-[min(28vh,240px)] overflow-y-auto">
            <div className="font-mono text-xs leading-relaxed text-foreground">
              {loading ? (
                <span className="text-muted-foreground">Loading…</span>
              ) : preview ? (
                <pre className="whitespace-pre-wrap break-words font-mono">{preview}</pre>
              ) : (
                <span className="text-muted-foreground">No text content for this memory.</span>
              )}
            </div>
          </TabsContent>
          <TabsContent value="properties" className="max-h-[min(28vh,240px)] overflow-y-auto">
            {point.labels.length > 0 ? (
              <ul className="list-inside list-disc space-y-1 font-mono text-xs text-foreground">
                {point.labels.map((lb) => (
                  <li key={lb} className="break-words">
                    {lb}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground text-xs">
                No ontology labels on this node.
              </span>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
