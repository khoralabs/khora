import "./index.css";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api.js";

/** Must match `DEMO_SEARCH_TOP_K` in `convex/memories.ts`. */
const SEARCH_TOP_K = 20;

const DEMO_NS = "demo";

export function App() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const addMemory = useMutation(api.memories.addMemory);
  const allMemories = useQuery(api.memories.listDemoMemories, {});
  const hits = useQuery(api.memories.searchMemories, q.trim() === "" ? "skip" : { q });

  const hitKeys = useMemo(() => new Set(hits?.map((h) => h.memory.key) ?? []), [hits]);

  return (
    <div className="app" style={{ maxWidth: 640, padding: 16 }}>
      <h1 style={{ fontSize: "1.25rem", marginTop: 0 }}>Memories demo</h1>
      <p style={{ opacity: 0.85, marginBottom: 16 }}>
        Namespace <code>{DEMO_NS}</code> — add text as memory <code>body</code>; search is lexical
        top {SEARCH_TOP_K} over this namespace.
      </p>

      <section style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Memory text" />
        <button
          type="button"
          onClick={() => {
            const t = text.trim();
            if (!t) return;
            void addMemory({ text: t }).then(() => setText(""));
          }}
        >
          Add
        </button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>
          All memories in namespace ({allMemories?.length ?? "…"})
        </h2>
        {allMemories === undefined ? (
          <p>Loading…</p>
        ) : allMemories.length === 0 ? (
          <p>None yet — add one above.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {allMemories.map((m) => (
              <li
                key={m.memoryId}
                style={{
                  opacity: hitKeys.has(m.key) ? 1 : 0.65,
                  fontWeight: hitKeys.has(m.key) ? 600 : 400,
                }}
              >
                <code>{m.key}</code>
                <span style={{ opacity: 0.75 }}> · {m.memoryId}</span>
                {hitKeys.has(m.key) ? (
                  <span style={{ marginLeft: 8, color: "lightgreen" }}>(in current search)</span>
                ) : null}
                {m.bodyText != null && m.bodyText !== "" ? (
                  <div style={{ marginTop: 6, opacity: 0.9, whiteSpace: "pre-wrap" }}>
                    {m.bodyText}
                  </div>
                ) : (
                  <div style={{ marginTop: 4, opacity: 0.5, fontSize: "0.85rem" }}>
                    No body text
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>Search</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text…" />
        {hits === undefined && q.trim() !== "" ? <p>Loading…</p> : null}
        {hits !== undefined && q.trim() === "" ? (
          <p>Type to search — up to {SEARCH_TOP_K} hits from the list above.</p>
        ) : null}
        {hits !== undefined && q.trim() !== "" && allMemories !== undefined ? (
          <p style={{ fontSize: "0.9rem", opacity: 0.85 }}>
            Showing up to {SEARCH_TOP_K} ranked lexical hits among {allMemories.length} memor
            {allMemories.length === 1 ? "y" : "ies"} in <code>{DEMO_NS}</code>.
          </p>
        ) : null}
        {hits !== undefined && q.trim() !== "" && hits.length === 0 ? <p>No results.</p> : null}
        {hits !== undefined && q.trim() !== "" && hits.length > 0 ? (
          <ol style={{ marginTop: 12, paddingLeft: 20 }}>
            {hits.map((h) => (
              <li key={`${h._id}-${h.source_key}`} style={{ marginBottom: 8 }}>
                <div>
                  <strong>Memory</strong> <code>{h.memory.key}</code>{" "}
                  <span style={{ opacity: 0.75 }}>({h.memory.namespace})</span>
                </div>
                <div>
                  <strong>Source key</strong> <code>{h.source_key}</code>
                </div>
                {"contentText" in h && (h as { contentText: string }).contentText !== "" ? (
                  <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                    <strong>Content</strong> {(h as { contentText: string }).contentText}
                  </div>
                ) : null}
                <div style={{ opacity: 0.85 }}>
                  Score <code>{h.score.toFixed(4)}</code>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
}

export default App;
