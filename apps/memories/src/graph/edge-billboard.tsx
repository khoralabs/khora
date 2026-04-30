import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SceneEdge } from "./projection-types.js";
import { graphLabelFingerprint } from "./projection-types.js";
import { useProjection } from "./use-projection.js";

type EdgePreviewJson = {
  edgeId?: string;
  fromKey?: string;
  toKey?: string;
  labels?: Array<{ kind: string; props: Record<string, unknown> }>;
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

  /** Union graph + API (same fingerprints); API wins on overlap. Sorted like graph reads. */
  const ontologyLabels = useMemo(() => {
    const m = new Map<string, SceneEdge["labels"][number]>();
    for (const lb of edge.labels) {
      m.set(graphLabelFingerprint(lb), lb);
    }
    if (detail?.labels) {
      for (const lb of detail.labels) {
        m.set(graphLabelFingerprint(lb), lb);
      }
    }
    return [...m.values()].sort((a, b) => a.kind.localeCompare(b.kind));
  }, [edge.labels, detail?.labels]);

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
              <div>
                <span className="text-muted-foreground">Directed</span>{" "}
                <span>{edge.directed ? "yes" : "no"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Label kinds</span>{" "}
                {ontologyLabels.length > 0 ? (
                  <span>{ontologyLabels.map((l) => l.kind).join(" · ")}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              {loading ? (
                <span className="text-muted-foreground text-[10px]">Loading edge detail…</span>
              ) : null}
            </div>
          </TabsContent>
          <TabsContent value="properties" className="max-h-[min(28vh,240px)] overflow-y-auto">
            <div className="space-y-3">
              {ontologyLabels.length > 0 ? (
                <ul className="list-inside list-disc space-y-1 font-mono text-xs text-foreground">
                  {ontologyLabels.map((lb) => (
                    <li key={graphLabelFingerprint(lb)} className="break-words">
                      <span className="font-medium">{lb.kind}</span>
                      {Object.keys(lb.props).length > 0 ? (
                        <span className="text-muted-foreground"> {JSON.stringify(lb.props)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground text-xs">
                  No ontology labels on this edge.
                </span>
              )}
              {propsEntries.length > 0 ? (
                <div className="space-y-1 border-t border-border/60 pt-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Edge metadata
                  </div>
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
                </div>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
