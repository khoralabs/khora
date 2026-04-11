import { FolderSearchIcon, RefreshCcwIcon, ScanSearchIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { LoaderWithMessage } from "./components/loader-with-message.js";
import type { GraphPayload, GraphSearchState } from "./graph/projection-types.js";
import { GraphScene } from "./graph/scene.js";
import { GraphProjectionProvider } from "./graph/use-projection.js";

function defaultNamespace(): string {
  if (typeof window === "undefined") return "cli";
  const q = new URLSearchParams(window.location.search).get("namespace");
  return q?.trim() || "cli";
}

type SearchApiResponse = {
  hitCount?: number;
  keys?: string[];
  error?: string;
};

export function App() {
  const [namespace, setNamespace] = useState(defaultNamespace);
  const [data, setData] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [graphSearch, setGraphSearch] = useState<GraphSearchState | null>(null);

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

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setGraphSearch(null);
      return;
    }
    const ac = new AbortController();
    const ns = namespace.trim();
    const id = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/search", {
            method: "POST",
            signal: ac.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              namespace: ns,
              query: q,
              topK: 10,
              maxNeighbors: 5,
            }),
          });
          const json = (await res.json()) as SearchApiResponse;
          if (ac.signal.aborted) return;
          if (!res.ok || json.error) {
            setGraphSearch(null);
            return;
          }
          setGraphSearch({
            relevantKeys: new Set(json.keys ?? []),
            hitCount: json.hitCount ?? 0,
          });
        } catch {
          if (!ac.signal.aborted) setGraphSearch(null);
        }
      })();
    }, 320);
    return () => {
      clearTimeout(id);
      ac.abort();
    };
  }, [searchQuery, namespace]);

  const searchSummary =
    searchQuery.trim().length > 0
      ? graphSearch
        ? `${graphSearch.hitCount} hit${graphSearch.hitCount === 1 ? "" : "s"} · ${graphSearch.relevantKeys.size} in subgraph`
        : "…"
      : "";

  const namespaceSummary = data ? `${data.nodes.length} nodes · ${data.edges.length} edges` : "";

  const headerInputClasses = "w-full max-w-sm";

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0">
        {data && data.nodes.length > 0 ? (
          <GraphProjectionProvider data={data} graphSearch={graphSearch}>
            <GraphScene />
          </GraphProjectionProvider>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-muted-foreground">
            {data && data.nodes.length === 0 ? (
              "No memories in this namespace (or no keys in graph)."
            ) : error ? (
              "Fix the error above and reload."
            ) : (
              <LoaderWithMessage message="Loading…" />
            )}
          </div>
        )}
      </div>

      <header className="app-chrome absolute left-0 right-0 top-0 z-10 flex flex-col gap-4 p-4">
        <InputGroup className={headerInputClasses}>
          <InputGroupInput
            placeholder="Namespace"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            aria-label="Namespace"
          />
          <InputGroupAddon>
            <FolderSearchIcon className="text-muted-foreground" aria-hidden />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end" className="text-xs font-normal tabular-nums">
            {namespaceSummary || "\u00a0"}
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            <InputGroupButton variant="ghost" disabled={loading} onClick={() => void load()}>
              <RefreshCcwIcon className="text-muted-foreground" aria-hidden />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup className={headerInputClasses}>
          <InputGroupInput
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search memories"
          />
          <InputGroupAddon>
            <ScanSearchIcon className="text-muted-foreground" aria-hidden />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end" className="text-xs font-normal tabular-nums">
            {searchSummary || "\u00a0"}
          </InputGroupAddon>
        </InputGroup>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </header>
    </div>
  );
}

export default App;
