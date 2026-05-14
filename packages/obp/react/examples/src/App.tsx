import "./app.css";
import {
  NbcChain,
  NbcChainDefaultLayout,
  NbcChainEdgeDetails,
  NbcChainEmptySelectionHint,
  NbcChainNodeDetails,
  nbcChainGraphToFlow,
} from "@khoralabs/obp-react";
import type { Edge, Node } from "@xyflow/react";
import { type ReactNode, useMemo } from "react";
import { demoNbcChainGraph } from "./demo-graph.ts";

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-10 border-b border-neutral-200 pb-2 text-lg font-semibold text-neutral-900 first:mt-0">
      {children}
    </h2>
  );
}

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function App() {
  const graph = useMemo(() => demoNbcChainGraph(), []);
  const { nodes, edges } = useMemo(() => nbcChainGraphToFlow(graph), [graph]);

  const offerNode = nodes.find((n: Node) => n.id === "offer:offer-genesis");
  const portNode = nodes.find((n: Node) => n.id === "port:port-a");
  const bindEdge = edges.find((e: Edge) => e.id.startsWith("bind:"));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">@khoralabs/obp-react · NbcChain</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          Standalone detail panels (no canvas), a manually composed flow shell, and the bundled{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">DefaultLayout</code> preset.
        </p>
      </header>

      <SectionTitle>Individual components</SectionTitle>
      <p className="mb-4 text-sm text-neutral-600">
        Imported by name; props mirror production usage. Edge details only render for bind edges (
        <code className="rounded bg-neutral-100 px-1 text-xs">edge.data.detail</code>
        ).
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel label="NbcChainEmptySelectionHint">
          <NbcChainEmptySelectionHint className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-3" />
        </Panel>
        <Panel label="NbcChainNodeDetails · offer">
          {offerNode !== undefined ? (
            <NbcChainNodeDetails
              node={offerNode}
              graph={graph}
              className="rounded-md border border-neutral-100 p-3"
            />
          ) : (
            <p className="text-sm text-red-600">Missing demo offer node.</p>
          )}
        </Panel>
        <Panel label="NbcChainNodeDetails · port">
          {portNode !== undefined ? (
            <NbcChainNodeDetails
              node={portNode}
              graph={graph}
              className="rounded-md border border-neutral-100 p-3"
            />
          ) : (
            <p className="text-sm text-red-600">Missing demo port node.</p>
          )}
        </Panel>
        <Panel label="NbcChainEdgeDetails · bind">
          {bindEdge !== undefined ? (
            <NbcChainEdgeDetails
              edge={bindEdge}
              className="rounded-md border border-neutral-100 p-3"
            />
          ) : (
            <p className="text-sm text-red-600">Missing demo bind edge.</p>
          )}
        </Panel>
      </div>

      <SectionTitle>Composition · manual shell</SectionTitle>
      <p className="mb-4 text-sm text-neutral-600">
        <code className="rounded bg-neutral-100 px-1 text-xs">NbcChain.Provider</code> →{" "}
        <code className="rounded bg-neutral-100 px-1 text-xs">NbcChain.Scene</code> with{" "}
        <code className="rounded bg-neutral-100 px-1 text-xs">Background</code> and{" "}
        <code className="rounded bg-neutral-100 px-1 text-xs">SelectionPanel</code> only (no
        controls).
      </p>
      <div className="relative h-80 w-full overflow-hidden rounded-lg border border-neutral-300 bg-neutral-100 shadow-inner">
        <NbcChain.Provider graph={graph}>
          <NbcChain.Scene>
            <NbcChain.Background gap={16} size={1} />
            <NbcChain.SelectionPanel className="max-h-[90%] overflow-auto rounded-md border border-neutral-200 bg-white/95 p-3 shadow-md backdrop-blur-[2px]" />
          </NbcChain.Scene>
        </NbcChain.Provider>
      </div>

      <SectionTitle>Composition · DefaultLayout</SectionTitle>
      <p className="mb-4 text-sm text-neutral-600">
        Preset that wires <code className="rounded bg-neutral-100 px-1 text-xs">Background</code>,{" "}
        <code className="rounded bg-neutral-100 px-1 text-xs">Controls</code>, and{" "}
        <code className="rounded bg-neutral-100 px-1 text-xs">SelectionPanel</code> inside{" "}
        <code className="rounded bg-neutral-100 px-1 text-xs">Scene</code>.
      </p>
      <div className="relative h-96 w-full overflow-hidden rounded-lg border border-neutral-300 bg-neutral-100 shadow-inner">
        <NbcChainDefaultLayout graph={graph} />
      </div>
    </div>
  );
}

export default App;
