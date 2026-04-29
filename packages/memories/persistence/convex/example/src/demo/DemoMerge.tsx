import type { ConvexMemoriesClient } from "@cfd/memories-convex";
import { convexReactClientToMemoriesClient, mergeMemory } from "@cfd/memories-convex";
import { memoriesConvexHostRefsFromApi } from "@cfd/memories-convex/react";
import type { MemoriesPersistenceAsync } from "@cfd/memories-core";
import type { ConvexReactClient } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api.js";
import { DEMO_NS, DEMO_NS_B } from "./constants.js";
import { demoVector768 } from "./embeddings.js";
import { memoriesApiSlice } from "./refs.js";

const EDGE_A = "edge-demo-a";
const EDGE_B = "edge-demo-b";

export function DemoMerge({
  persistence,
  convex,
}: {
  persistence: MemoriesPersistenceAsync;
  convex: ConvexReactClient;
}) {
  const memoriesHostRefs = useMemo(() => memoriesConvexHostRefsFromApi(api), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg(`${label} OK`);
    } catch (e) {
      setMsg(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>Merge playground</h2>
      <p style={{ fontSize: "0.85rem", opacity: 0.85, marginBottom: 12 }}>
        Uses <code>{`mergeMemory({ persistence }, …)`}</code> except <strong>Atomic</strong> (single
        mutation via overload B).
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run("Simple body", async () => {
              await mergeMemory(
                { persistence },
                {
                  namespace: DEMO_NS,
                  key: crypto.randomUUID(),
                  labels: [],
                  content: [{ key: "body", text: `Simple memory ${new Date().toISOString()}` }],
                },
              );
            })
          }
        >
          {busy === "Simple body" ? "…" : "Add simple memory (body only)"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run("Labeled", async () => {
              await mergeMemory(
                { persistence },
                {
                  namespace: DEMO_NS,
                  key: crypto.randomUUID(),
                  labels: [{ kind: "DemoPerson", props: { name: "Ada", role: "demo" } }],
                  content: [
                    { key: "body", text: "Labeled row (label-props search path runs on merge)" },
                  ],
                },
              );
            })
          }
        >
          {busy === "Labeled" ? "…" : "Add labeled memory"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run("Hybrid body", async () => {
              const text = `Vector-backed ${Date.now()}`;
              await mergeMemory(
                { persistence },
                {
                  namespace: DEMO_NS,
                  key: crypto.randomUUID(),
                  labels: [],
                  content: [
                    { key: "body", text },
                    { key: "emb", vector: demoVector768(text) },
                  ],
                },
              );
            })
          }
        >
          {busy === "Hybrid body" ? "…" : "Add memory (body + 768-dim vector on emb)"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run("Graph pair", async () => {
              await mergeMemory(
                { persistence },
                {
                  namespace: DEMO_NS,
                  key: EDGE_B,
                  labels: [{ kind: "DemoNode", props: { side: "b" } }],
                  content: [{ key: "body", text: "Neighbor target B" }],
                },
              );
              await mergeMemory(
                { persistence },
                {
                  namespace: DEMO_NS,
                  key: EDGE_A,
                  labels: [{ kind: "DemoNode", props: { side: "a" } }],
                  properties: { note: "has outgoing edge" },
                  content: [{ key: "body", text: "Neighbor source A" }],
                  edges: [
                    {
                      memory_key: EDGE_B,
                      direction: "out",
                      label: { kind: "relates", props: { strength: 1 } },
                    },
                  ],
                },
              );
            })
          }
        >
          {busy === "Graph pair" ? "…" : `Seed graph pair (${EDGE_A} → ${EDGE_B})`}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run("Namespace B", async () => {
              await mergeMemory(
                { persistence },
                {
                  namespace: DEMO_NS_B,
                  key: crypto.randomUUID(),
                  labels: [],
                  content: [{ key: "body", text: `Other namespace ${DEMO_NS_B}` }],
                },
              );
            })
          }
        >
          {busy === "Namespace B" ? "…" : `Add memory in ${DEMO_NS_B}`}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run("Atomic", async () => {
              const client = convexReactClientToMemoriesClient(convex) as ConvexMemoriesClient;
              await mergeMemory(
                { client, refs: memoriesApiSlice(memoriesHostRefs) },
                {
                  namespace: DEMO_NS,
                  key: crypto.randomUUID(),
                  labels: [],
                  content: [{ key: "body", text: "Single-transaction merge (mergeMemoryAtomic)" }],
                },
              );
            })
          }
        >
          {busy === "Atomic" ? "…" : "Atomic merge (overload B)"}
        </button>
      </div>
      {msg ? <p style={{ marginTop: 12, fontSize: "0.85rem", opacity: 0.9 }}>{msg}</p> : null}
    </section>
  );
}
