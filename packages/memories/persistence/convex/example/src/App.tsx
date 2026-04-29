import "./index.css";
import { useMemoriesPersistence } from "@cfd/memories-convex/react";
import { useConvex } from "convex/react";
import { DEMO_NS, DEMO_NS_B, SEARCH_TOP_K } from "./demo/constants.js";
import { DemoCapabilities } from "./demo/DemoCapabilities.js";
import { DemoGraph } from "./demo/DemoGraph.js";
import { DemoMemoryList } from "./demo/DemoMemoryList.js";
import { DemoMerge } from "./demo/DemoMerge.js";
import { DemoSearch } from "./demo/DemoSearch.js";

export function App() {
  const persistence = useMemoriesPersistence();
  const convex = useConvex();

  return (
    <div className="app" style={{ maxWidth: 720, padding: 16 }}>
      <h1 style={{ fontSize: "1.25rem", marginTop: 0 }}>Memories Convex component — full demo</h1>
      <p style={{ opacity: 0.85, marginBottom: 16, fontSize: "0.9rem" }}>
        <code>MemoriesPersistenceProvider</code> + <code>useMemoriesPersistence()</code> drive
        merges and searches against <code>{DEMO_NS}</code> / <code>{DEMO_NS_B}</code>. Listing uses
        component queries directly; merge/search use <code>@cfd/memories-convex</code> client APIs
        (topK = {SEARCH_TOP_K}).
      </p>

      <DemoCapabilities persistence={persistence} />
      <DemoMerge persistence={persistence} convex={convex} />
      <DemoMemoryList />
      <DemoSearch persistence={persistence} convex={convex} />
      <DemoGraph persistence={persistence} />
    </div>
  );
}

export default App;
