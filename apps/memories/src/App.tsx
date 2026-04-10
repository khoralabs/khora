import { useCallback, useEffect, useState } from "react";
import { GraphView, type GraphPayload } from "./GraphView";

function defaultNamespace(): string {
  if (typeof window === "undefined") return "cli";
  const q = new URLSearchParams(window.location.search).get("namespace");
  return q?.trim() || "cli";
}

export function App() {
  const [namespace, setNamespace] = useState(defaultNamespace);
  const [data, setData] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/graph?namespace=${encodeURIComponent(namespace.trim())}`);
      const json = (await res.json()) as GraphPayload & { error?: string };
      if (!res.ok) {
        setData(null);
        setError(json.error ?? res.statusText);
        return;
      }
      if ("error" in json && json.error) {
        setData(null);
        setError(json.error);
        return;
      }
      setData({
        namespace: json.namespace,
        nodes: json.nodes ?? [],
        edges: json.edges ?? [],
      });
    } catch (e) {
      setData(null);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [namespace]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0">
        {data && data.nodes.length > 0 ? (
          <GraphView data={data} namespace={namespace.trim() || data.namespace} />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-muted-foreground">
            {data && data.nodes.length === 0
              ? "No memories in this namespace (or no keys in graph)."
              : error
                ? "Fix the error above and reload."
                : "Loading…"}
          </div>
        )}
      </div>

      <header className="absolute left-0 right-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/85 px-3 py-2 shadow-sm backdrop-blur-md sm:px-4 sm:py-3">
        <span className="text-sm font-medium">Memory graph</span>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">namespace</span>
          <input
            className="w-36 rounded-md border border-input bg-background/90 px-2 py-1 font-mono text-sm sm:w-48"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
          />
        </label>
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Reload"}
        </button>
        {data ? (
          <span className="text-xs text-muted-foreground">
            {data.nodes.length} nodes · {data.edges.length} edges
          </span>
        ) : null}
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </header>
    </div>
  );
}

export default App;
