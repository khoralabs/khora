import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import { DEMO_NS, DEMO_NS_B } from "./constants.js";
import type { Row } from "./hostComponents.js";

export function DemoMemoryList() {
  const listA = useQuery(api.memoriesHostQueries.listMemoriesInNamespace, {
    namespace: DEMO_NS,
  }) as Row[] | undefined;
  const listB = useQuery(api.memoriesHostQueries.listMemoriesInNamespace, {
    namespace: DEMO_NS_B,
  }) as Row[] | undefined;

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>Memories by namespace</h2>
      <p style={{ fontSize: "0.85rem", opacity: 0.85, marginBottom: 12 }}>
        Reactive list via <code>useQuery(api.memoriesHostQueries.listMemoriesInNamespace)</code>{" "}
        (host bridge → component query).
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h3 style={{ fontSize: "0.9rem", margin: "0 0 6px" }}>
            <code>{DEMO_NS}</code> ({listA?.length ?? "…"})
          </h3>
          <MemoryUl rows={listA} />
        </div>
        <div>
          <h3 style={{ fontSize: "0.9rem", margin: "0 0 6px" }}>
            <code>{DEMO_NS_B}</code> ({listB?.length ?? "…"})
          </h3>
          <MemoryUl rows={listB} />
        </div>
      </div>
    </section>
  );
}

function MemoryUl({ rows }: { rows: Row[] | undefined }) {
  if (rows === undefined) return <p>Loading…</p>;
  if (rows.length === 0) return <p style={{ opacity: 0.75 }}>Empty</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.85rem" }}>
      {rows.map((m) => (
        <li key={m.memoryId} style={{ marginBottom: 6 }}>
          <code>{m.key}</code>
          {m.bodyText ? (
            <div style={{ opacity: 0.85, whiteSpace: "pre-wrap", marginTop: 2 }}>{m.bodyText}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
