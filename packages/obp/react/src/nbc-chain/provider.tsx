import type { NbcChainGraph } from "@khoralabs/obp-nbc";
import {
  type Edge,
  type Node,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from "react";
import { NbcChainContext, type NbcChainContextValue } from "./context";
import type { NbcChainAfterBindViewport, NbcChainFlowSelection } from "./flow-types.ts";
import { nbcChainGraphToFlow } from "./layout.ts";
import { mergeClassNames } from "./merge-class-names.ts";
import { nbcChainDefaultNodeTypes } from "./nodes";
import { NBC_CHAIN_CANVAS_SHELL_LAYOUT } from "./structural-layout.ts";

export type NbcChainProviderProps = Omit<ComponentProps<"div">, "children"> & {
  graph: NbcChainGraph;
  /** When set, viewport fits that subgraph when nothing is selected. */
  focusNodeIds?: string[] | null;
  /**
   * When automation is active (no manual pan/zoom yet; no selection): how to frame the graph after updates.
   * - `focus`: fit `focusNodeIds` when non-empty, else full graph.
   * - `encapsulate`: always fit the full graph (`focusNodeIds` ignored for framing).
   */
  afterBindViewport?: NbcChainAfterBindViewport;
  /**
   * Inner wrapper around scene children (absolute fill). Structural layout is merged first;
   * override via `className` / `style`.
   */
  canvasShellProps?: ComponentProps<"div">;
  children: ReactNode;
};

function NbcChainStateProvider({
  graph,
  focusNodeIds,
  afterBindViewport = "focus",
  canvasShellProps,
  children,
}: Pick<
  NbcChainProviderProps,
  "graph" | "focusNodeIds" | "afterBindViewport" | "canvasShellProps" | "children"
>) {
  const layout = useMemo(() => nbcChainGraphToFlow(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selection, setSelection] = useState<NbcChainFlowSelection>(null);

  const focusSceneKey =
    focusNodeIds === null || focusNodeIds === undefined || focusNodeIds.length === 0
      ? ""
      : focusNodeIds.join("\u001e");

  useEffect(() => {
    setNodes(
      layout.nodes.map((n) => ({
        ...n,
        selected: selection?.kind === "node" && selection.id === n.id,
      })),
    );
    setEdges(
      layout.edges.map((e) => ({
        ...e,
        selected: selection?.kind === "edge" && selection.id === e.id,
      })),
    );
  }, [layout, selection, setNodes, setEdges]);

  useEffect(() => {
    if (selection?.kind === "node" && !nodes.some((n) => n.id === selection.id)) {
      setSelection(null);
    }
    if (selection?.kind === "edge" && !edges.some((e) => e.id === selection.id)) {
      setSelection(null);
    }
  }, [nodes, edges, selection]);

  const selectedNode = useMemo(() => {
    if (selection?.kind !== "node") return undefined;
    return nodes.find((n) => n.id === selection.id);
  }, [nodes, selection]);

  const selectedEdge = useMemo(() => {
    if (selection?.kind !== "edge") return undefined;
    return edges.find((e) => e.id === selection.id);
  }, [edges, selection]);

  const value = useMemo(
    (): NbcChainContextValue => ({
      graph,
      focusSceneKey,
      afterBindViewport,
      nodes,
      edges,
      setNodes,
      setEdges,
      onNodesChange,
      onEdgesChange,
      selection,
      setSelection,
      selectedNode,
      selectedEdge,
      defaultNodeTypes: nbcChainDefaultNodeTypes,
    }),
    [
      graph,
      focusSceneKey,
      afterBindViewport,
      nodes,
      edges,
      setNodes,
      setEdges,
      onNodesChange,
      onEdgesChange,
      selection,
      selectedNode,
      selectedEdge,
    ],
  );

  const {
    className: shellClassName,
    style: shellStyle,
    children: _ignoreShellChildren,
    ...shellRest
  } = canvasShellProps ?? {};

  return (
    <NbcChainContext.Provider value={value}>
      <div
        data-slot="nbc-chain-canvas-shell"
        {...shellRest}
        className={mergeClassNames(shellClassName)}
        style={{ ...NBC_CHAIN_CANVAS_SHELL_LAYOUT, ...shellStyle }}
      >
        {children}
      </div>
    </NbcChainContext.Provider>
  );
}

/** Root host + React Flow context + chain graph state. */
export function NbcChainProvider({
  graph,
  focusNodeIds = null,
  afterBindViewport = "focus",
  canvasShellProps,
  children,
  ...rest
}: NbcChainProviderProps) {
  return (
    <div data-slot="nbc-chain-provider-root" {...rest}>
      <ReactFlowProvider>
        <NbcChainStateProvider
          graph={graph}
          focusNodeIds={focusNodeIds}
          afterBindViewport={afterBindViewport}
          canvasShellProps={canvasShellProps}
        >
          {children}
        </NbcChainStateProvider>
      </ReactFlowProvider>
    </div>
  );
}
