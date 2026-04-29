import type { MemoriesPersistenceAsync } from "@cfd/memories-core";
import { useState } from "react";
import { DEMO_NS } from "./constants.js";

export function DemoGraph({ persistence }: { persistence: MemoriesPersistenceAsync }) {
  const [key, setKey] = useState("edge-demo-a");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [incident, setIncident] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<string | null>(null);
  const [namespaceEdges, setNamespaceEdges] = useState<string | null>(null);
  const [namespaceEdgeTotal, setNamespaceEdgeTotal] = useState(0);

  const load = async () => {
    const k = key.trim();
    if (!k) return;
    setBusy(true);
    setErr(null);
    try {
      const [inc, neigh, ns] = await Promise.all([
        persistence.listIncidentGraphEdges(DEMO_NS, k),
        persistence.listNeighborsForMemory({ namespace: DEMO_NS, key: k }),
        persistence.loadGraphEdgesForNamespace(DEMO_NS),
      ]);
      setIncident(JSON.stringify(inc, null, 2));
      setNeighbors(JSON.stringify(neigh, null, 2));
      setNamespaceEdgeTotal(ns.length);
      setNamespaceEdges(JSON.stringify(ns.slice(0, 40), null, 2));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>Graph / neighbors</h2>
      <p style={{ fontSize: "0.85rem", opacity: 0.85, marginBottom: 8 }}>
        <code>listIncidentGraphEdges</code>, <code>listNeighborsForMemory</code>,{" "}
        <code>loadGraphEdgesForNamespace</code> on <code>{DEMO_NS}</code>. Seed the graph pair from
        Merge first.
      </p>
      <div
        style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        <label style={{ fontSize: "0.85rem" }}>
          Memory key{" "}
          <input value={key} onChange={(e) => setKey(e.target.value)} style={{ minWidth: 160 }} />
        </label>
        <button type="button" onClick={() => void load()} disabled={busy}>
          {busy ? "…" : "Load"}
        </button>
      </div>
      {err ? <p style={{ color: "salmon", fontSize: "0.85rem" }}>{err}</p> : null}
      {incident !== null ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: "0.9rem" }}>Incident edges</summary>
          <pre style={{ fontSize: "0.75rem", overflow: "auto", maxHeight: 200 }}>{incident}</pre>
        </details>
      ) : null}
      {neighbors !== null ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: "0.9rem" }}>Neighbors (hydrated)</summary>
          <pre style={{ fontSize: "0.75rem", overflow: "auto", maxHeight: 240 }}>{neighbors}</pre>
        </details>
      ) : null}
      {namespaceEdges !== null ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: "0.9rem" }}>
            Namespace edges (first 40 of {namespaceEdgeTotal})
          </summary>
          <pre style={{ fontSize: "0.75rem", overflow: "auto", maxHeight: 200 }}>
            {namespaceEdges}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
