import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SceneEdge } from "./projection-types.js";
import { useProjection } from "./use-projection.js";

type EdgePreviewJson = {
  edgeId?: string;
  fromKey?: string;
  toKey?: string;
  labels?: string[];
  properties?: Record<string, unknown> | null;
  error?: string;
};

export function EdgePreviewCard({ edge, open }: { edge: SceneEdge; open: boolean }) {
  const { namespace, onMemoryPreviewPointerEnter, onMemoryPreviewPointerLeave } = useProjection();

  const [detail, setDetail] = useState<EdgePreviewJson | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setDetail(null);
    void fetch(
      `/api/edge-preview?namespace=${encodeURIComponent(namespace)}&edgeId=${encodeURIComponent(edge.edgeId)}`,
      { signal: ac.signal },
    )
      .then((res) => res.json() as Promise<EdgePreviewJson>)
      .then((json) => {
        if (!ac.signal.aborted) setDetail(json.error ? null : json);
      })
      .catch(() => {
        if (!ac.signal.aborted) setDetail(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [open, namespace, edge.edgeId]);

  if (!open) return null;

  const propsEntries =
    detail?.properties && Object.keys(detail.properties).length > 0
      ? Object.entries(detail.properties)
      : [];

  return (
    <Card
      aria-label="Edge preview"
      className="app-chrome w-full max-h-[min(50vh,420px)] gap-0 border-border/60 bg-background/95 py-3 text-left shadow-lg backdrop-blur-md"
      onPointerEnter={onMemoryPreviewPointerEnter}
      onPointerLeave={onMemoryPreviewPointerLeave}
    >
      <CardHeader className="gap-1 px-3 pb-2 pt-0">
        <CardTitle className="font-mono text-[10px] font-normal leading-tight text-muted-foreground">
          <span className="text-foreground">{edge.fromKey}</span>
          <span className="text-muted-foreground"> ↔ </span>
          <span className="text-foreground">{edge.toKey}</span>
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
            <div className="space-y-2 font-mono text-xs leading-relaxed text-foreground">
              {loading ? (
                <span className="text-muted-foreground">Loading…</span>
              ) : (
                <>
                  <div>
                    <span className="text-muted-foreground">From</span>{" "}
                    <span className="break-all">{edge.fromKey}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">To</span>{" "}
                    <span className="break-all">{edge.toKey}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Labels</span>{" "}
                    {edge.labels.length > 0 ? (
                      <span>{edge.labels.join(" · ")}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </TabsContent>
          <TabsContent value="properties" className="max-h-[min(28vh,240px)] overflow-y-auto">
            {loading ? (
              <span className="text-muted-foreground text-xs">Loading…</span>
            ) : propsEntries.length > 0 ? (
              <dl className="space-y-1 font-mono text-[11px] text-foreground">
                {propsEntries.map(([k, v]) => (
                  <div key={k} className="grid gap-0.5">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-all pl-1">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : detail?.labels && detail.labels.length > 0 ? (
              <ul className="list-inside list-disc space-y-1 font-mono text-xs">
                {detail.labels.map((lb) => (
                  <li key={lb}>{lb}</li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground text-xs">
                No JSON properties on this edge.
              </span>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
