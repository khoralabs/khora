import { CONVEX_VECTOR_DIMENSIONS } from "@cfd/memories-convex";
import type { MemoriesPersistenceAsync } from "@cfd/memories-core";
import { useEffect, useState } from "react";

export function DemoCapabilities({ persistence }: { persistence: MemoriesPersistenceAsync }) {
  const caps = persistence.capabilities;
  const [indexedDims, setIndexedDims] = useState<number[] | null>(null);
  useEffect(() => {
    void persistence.listVectorEmbeddingIndexDimensions().then(setIndexedDims);
  }, [persistence]);

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>Capabilities</h2>
      <p style={{ fontSize: "0.85rem", opacity: 0.85, marginBottom: 8 }}>
        From <code>useMemoriesPersistence()</code> and{" "}
        <code>listVectorEmbeddingIndexDimensions()</code>. Supported embedding widths (package):{" "}
        <code>{CONVEX_VECTOR_DIMENSIONS.join(", ")}</code>.
      </p>
      <table
        style={{
          borderCollapse: "collapse",
          fontSize: "0.85rem",
          width: "100%",
          maxWidth: 480,
        }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 4 }}>Flag</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #444", padding: 4 }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {caps &&
            (Object.entries(caps) as [string, boolean][]).map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: 4, fontFamily: "monospace" }}>{k}</td>
                <td style={{ padding: 4 }}>{String(v)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p style={{ fontSize: "0.85rem", marginTop: 8, opacity: 0.85 }}>
        Indexed vector dimensions in DB (may be empty until you store vectors):{" "}
        {indexedDims === null ? "…" : indexedDims.length ? indexedDims.join(", ") : "(none yet)"}
      </p>
    </section>
  );
}
