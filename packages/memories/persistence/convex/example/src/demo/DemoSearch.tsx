import type { ConvexMemoriesClient } from "@khoralabs/memories-convex";
import {
  convexReactClientToMemoriesClient,
  createConvexLexicalTextStore,
  search,
} from "@khoralabs/memories-convex";
import type { MemoriesPersistenceAsync, SearchHit } from "@khoralabs/memories-core";
import type { SourceMap } from "@khoralabs/memories-core/persistence";
import type { ConvexReactClient } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { DEMO_NS, DEMO_NS_B, SEARCH_TOP_K } from "./constants.js";
import { demoVector768 } from "./embeddings.js";
import { getMemoriesQueries } from "./hostComponents.js";

type HitRow = SearchHit & { contentText?: string };

export function DemoSearch({
  persistence,
  convex,
}: {
  persistence: MemoriesPersistenceAsync;
  convex: ConvexReactClient;
}) {
  const { getLexicalTextForMemorySource } = useMemo(() => getMemoriesQueries(), []);
  const [q, setQ] = useState("");
  const [hybrid, setHybrid] = useState(false);
  const [neighbors, setNeighbors] = useState(false);
  const [maxNeighbors, setMaxNeighbors] = useState(3);
  const [multiNs, setMultiNs] = useState(false);
  const [unscoped, setUnscoped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<HitRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    const text = q.trim();
    if (text === "") {
      setHits([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const content = hybrid
        ? ({ text, vector: demoVector768(text) } as const)
        : ({ text } as const);
      const hitsRaw = await search(
        { persistence },
        {
          namespace: DEMO_NS,
          ...(multiNs ? { additionalNamespaces: [DEMO_NS_B] } : {}),
          ...(unscoped ? { searchEntireDatabase: true as const } : {}),
          content,
          options: {
            topK: SEARCH_TOP_K,
            neighbors: !!neighbors,
            ...(neighbors && maxNeighbors >= 0 ? { maxNeighbors } : {}),
            ...(hybrid ? { arms: { lexical: 1, vector: 1 } } : {}),
          },
        },
      );
      const client = convexReactClientToMemoriesClient(convex) as ConvexMemoriesClient;
      const store = createConvexLexicalTextStore(
        (ref, args) => client.query(ref as never, args as never),
        getLexicalTextForMemorySource,
      );
      const enriched: HitRow[] = await Promise.all(
        hitsRaw.map(async (h) => {
          try {
            const resolved = await store.resolve(h as SourceMap);
            const contentText = resolved.kind === "string" ? resolved.string : "";
            return { ...h, contentText };
          } catch {
            return { ...h, contentText: "" };
          }
        }),
      );
      setHits(enriched);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setHits(null);
    } finally {
      setLoading(false);
    }
  }, [
    convex,
    getLexicalTextForMemorySource,
    hybrid,
    maxNeighbors,
    multiNs,
    neighbors,
    persistence,
    q,
    unscoped,
  ]);

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>Search playground</h2>
      <p style={{ fontSize: "0.85rem", opacity: 0.85, marginBottom: 8 }}>
        Client <code>{`search({ persistence }, …)`}</code> — lexical, optional hybrid (text +
        deterministic 768-dim vector), neighbors, extra namespace, unscoped DB search.
      </p>
      {unscoped ? (
        <p style={{ fontSize: "0.8rem", color: "salmon", marginBottom: 8 }}>
          Unscoped search scans all namespaces — fine for this toy demo, not for huge production
          datasets.
        </p>
      ) : null}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 8,
          alignItems: "center",
        }}
      >
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={hybrid} onChange={(e) => setHybrid(e.target.checked)} />
          Hybrid (lexical + vector)
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.85rem" }}>
          <input
            type="checkbox"
            checked={neighbors}
            onChange={(e) => setNeighbors(e.target.checked)}
          />
          Neighbors
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={multiNs} onChange={(e) => setMultiNs(e.target.checked)} />
          Include <code>{DEMO_NS_B}</code>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.85rem" }}>
          <input
            type="checkbox"
            checked={unscoped}
            onChange={(e) => setUnscoped(e.target.checked)}
          />
          Entire database
        </label>
      </div>
      {neighbors ? (
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: "0.85rem",
            marginBottom: 8,
          }}
        >
          maxNeighbors
          <input
            type="number"
            min={0}
            max={20}
            value={maxNeighbors}
            onChange={(e) => setMaxNeighbors(Number(e.target.value))}
            style={{ width: 56 }}
          />
        </label>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search text…"
          style={{ flex: 1, minWidth: 120 }}
        />
        <button type="button" onClick={() => void runSearch()} disabled={loading}>
          {loading ? "…" : "Run search"}
        </button>
      </div>
      {err ? <p style={{ color: "salmon", fontSize: "0.85rem" }}>{err}</p> : null}
      {hits !== null && hits.length === 0 && q.trim() !== "" ? <p>No results.</p> : null}
      {hits !== null && hits.length > 0 ? (
        <ol style={{ marginTop: 8, paddingLeft: 20, fontSize: "0.9rem" }}>
          {hits.map((h) => (
            <li key={`${h._id}-${h.source_key}`} style={{ marginBottom: 10 }}>
              <div>
                <strong>Memory</strong> <code>{h.memory.key}</code>{" "}
                <span style={{ opacity: 0.75 }}>({h.memory.namespace})</span>
              </div>
              <div>
                <strong>Source</strong> <code>{h.source_key}</code> · score{" "}
                <code>{h.score.toFixed(4)}</code>
              </div>
              {h.contentText ? (
                <div style={{ marginTop: 4, whiteSpace: "pre-wrap", opacity: 0.9 }}>
                  {h.contentText}
                </div>
              ) : null}
              {h.neighbors && h.neighbors.length > 0 ? (
                <ul style={{ marginTop: 6, opacity: 0.85 }}>
                  {h.neighbors.map((n) => (
                    <li key={n._id}>
                      Neighbor <code>{n.key}</code>
                      {n.neighborScore !== undefined ? (
                        <span style={{ marginLeft: 6 }}>
                          · neighborScore {n.neighborScore.toFixed(4)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
