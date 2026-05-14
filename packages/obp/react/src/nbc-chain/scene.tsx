import { type Edge, type Node, ReactFlow } from "@xyflow/react";
import { type ComponentProps, useCallback, useRef } from "react";
import { useNbcChain } from "./context.tsx";
import { NBC_CHAIN_SCENE_FLOW_LAYOUT } from "./structural-layout.ts";
import { NbcChainViewportFitEffect } from "./viewport-fit.tsx";

export type NbcChainSceneProps = Omit<
  ComponentProps<typeof ReactFlow>,
  "nodes" | "edges" | "onNodesChange" | "onEdgesChange"
> & {
  nodes?: ComponentProps<typeof ReactFlow>["nodes"];
  edges?: ComponentProps<typeof ReactFlow>["edges"];
  onNodesChange?: ComponentProps<typeof ReactFlow>["onNodesChange"];
  onEdgesChange?: ComponentProps<typeof ReactFlow>["onEdgesChange"];
};

function isUserViewportGesture(ev: unknown): boolean {
  return ev instanceof Event && ev.isTrusted === true;
}

/** React Flow canvas: nodes/edges/selection wiring + viewport automation. */
export function NbcChainScene({
  nodeTypes,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  onMoveStart,
  onWheel,
  style,
  children,
  nodes: nodesProp,
  edges: edgesProp,
  onNodesChange: onNodesChangeProp,
  onEdgesChange: onEdgesChangeProp,
  ...rest
}: NbcChainSceneProps) {
  const ctx = useNbcChain();
  const userAdjustedViewportRef = useRef(false);

  const handleMoveStart = useCallback<NonNullable<ComponentProps<typeof ReactFlow>["onMoveStart"]>>(
    (event, ...args) => {
      if (isUserViewportGesture(event)) {
        userAdjustedViewportRef.current = true;
      }
      onMoveStart?.(event, ...args);
    },
    [onMoveStart],
  );

  const handleWheel = useCallback<NonNullable<ComponentProps<typeof ReactFlow>["onWheel"]>>(
    (event) => {
      if (isUserViewportGesture(event)) {
        userAdjustedViewportRef.current = true;
      }
      onWheel?.(event);
    },
    [onWheel],
  );

  const handleNodeClick = useCallback(
    (
      e: Parameters<NonNullable<ComponentProps<typeof ReactFlow>["onNodeClick"]>>[0],
      node: Node,
    ) => {
      ctx.setSelection({ kind: "node", id: node.id });
      onNodeClick?.(e, node);
    },
    [ctx, onNodeClick],
  );

  const handleEdgeClick = useCallback(
    (
      e: Parameters<NonNullable<ComponentProps<typeof ReactFlow>["onEdgeClick"]>>[0],
      edge: Edge,
    ) => {
      ctx.setSelection({ kind: "edge", id: edge.id });
      onEdgeClick?.(e, edge);
    },
    [ctx, onEdgeClick],
  );

  const handlePaneClick = useCallback(
    (e: Parameters<NonNullable<ComponentProps<typeof ReactFlow>["onPaneClick"]>>[0]) => {
      ctx.setSelection(null);
      onPaneClick?.(e);
    },
    [ctx, onPaneClick],
  );

  return (
    <ReactFlow
      data-slot="nbc-chain-scene"
      {...rest}
      style={{ ...NBC_CHAIN_SCENE_FLOW_LAYOUT, ...style }}
      nodes={nodesProp ?? ctx.nodes}
      edges={edgesProp ?? ctx.edges}
      nodeTypes={nodeTypes ?? ctx.defaultNodeTypes}
      onNodesChange={onNodesChangeProp ?? ctx.onNodesChange}
      onEdgesChange={onEdgesChangeProp ?? ctx.onEdgesChange}
      nodesDraggable={rest.nodesDraggable ?? false}
      nodesConnectable={rest.nodesConnectable ?? false}
      elementsSelectable={rest.elementsSelectable ?? true}
      minZoom={rest.minZoom ?? 0.001}
      onMoveStart={handleMoveStart}
      onWheel={handleWheel}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      onPaneClick={handlePaneClick}
    >
      <NbcChainViewportFitEffect
        nodes={ctx.nodes}
        edges={ctx.edges}
        selection={ctx.selection}
        focusSceneKey={ctx.focusSceneKey}
        afterBindViewport={ctx.afterBindViewport}
        userAdjustedViewportRef={userAdjustedViewportRef}
      />
      {children}
    </ReactFlow>
  );
}
