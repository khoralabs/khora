import type { NbcChainGraph } from "@khoralabs/obp-nbc";
import type { Edge, Node, NodeTypes, useEdgesState, useNodesState } from "@xyflow/react";
import { createContext, useContext } from "react";
import type { NbcChainAfterBindViewport, NbcChainFlowSelection } from "./flow-types.ts";

export type { NbcChainAfterBindViewport, NbcChainFlowSelection };

export type NbcChainContextValue = {
  graph: NbcChainGraph;
  focusSceneKey: string;
  afterBindViewport: NbcChainAfterBindViewport;
  nodes: Node[];
  edges: Edge[];
  setNodes: ReturnType<typeof useNodesState<Node>>[1];
  setEdges: ReturnType<typeof useEdgesState<Edge>>[1];
  onNodesChange: ReturnType<typeof useNodesState<Node>>[2];
  onEdgesChange: ReturnType<typeof useEdgesState<Edge>>[2];
  selection: NbcChainFlowSelection;
  setSelection: (s: NbcChainFlowSelection) => void;
  selectedNode: Node | undefined;
  selectedEdge: Edge | undefined;
  defaultNodeTypes: NodeTypes;
};

const NbcChainContext = createContext<NbcChainContextValue | null>(null);

export function useNbcChain(): NbcChainContextValue {
  const v = useContext(NbcChainContext);
  if (v === null) {
    throw new Error("useNbcChain must be used under NbcChainProvider");
  }
  return v;
}

export { NbcChainContext };
