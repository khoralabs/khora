import type { GraphSnapshot } from "@cfd/obp-core";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  type NodeTypes,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type DagBindEdgeData,
  type DagOfferNodeData,
  type DagPortNodeData,
  graphSnapshotToFlow,
} from "./layout.ts";

/** Browser scheduling; typed via `globalThis` so checking works without `lib: ["DOM"]` (e.g. workspace root tsconfig). */
const browserFrame = globalThis as typeof globalThis & {
  requestAnimationFrame: (callback: () => void) => number;
  cancelAnimationFrame: (handle: number) => void;
};

/** Minimal host layout for React Flow (percentage height needs a sized parent). */
const hostStyleDefault: CSSProperties = {
  width: "100%",
  flex: "1 1 0",
  minHeight: 280,
  position: "relative",
};

/** Absolute fill layer inside the host. */
const canvasShellStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
};

const cardStyle: CSSProperties = {
  border: "1px solid #1a1a1a",
  background: "#fff",
  color: "#0a0a0a",
  borderRadius: 4,
};

const panelBaseStyle: CSSProperties = {
  maxWidth: "min(22rem, 86vw)",
  maxHeight: "min(70vh, 28rem)",
  overflow: "auto",
  margin: "0.5rem",
  boxSizing: "border-box",
  padding: "0.65rem 0.75rem",
  fontSize: "0.75rem",
  lineHeight: 1.35,
  background: "#fff",
  border: "1px solid #c4c4c4",
  borderRadius: 6,
  boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
  textAlign: "left",
};

const hintPanelStyle: CSSProperties = {
  ...panelBaseStyle,
  maxWidth: "14rem",
  color: "#555",
  maxHeight: "none",
};

const titleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: "0.8rem",
  marginBottom: "0.4rem",
  color: "#111",
};

const dlGridStyle: CSSProperties = {
  margin: 0,
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "0.2rem 0.65rem",
};

const dtStyle: CSSProperties = { margin: 0, color: "#666", fontWeight: 500 };
const ddStyle: CSSProperties = { margin: 0, wordBreak: "break-word" };
const preStyle: CSSProperties = {
  margin: "0.25rem 0 0",
  padding: "0.4rem 0.5rem",
  maxHeight: "min(12rem, 40vh)",
  overflow: "auto",
  fontSize: "0.68rem",
  lineHeight: 1.4,
  background: "#f5f5f5",
  border: "1px solid #ddd",
  borderRadius: 4,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

function formatTs(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text = value === undefined ? "—" : JSON.stringify(value, null, 2);
  return (
    <>
      <div style={{ ...titleStyle, marginTop: "0.45rem" }}>{label}</div>
      <pre style={preStyle}>{text}</pre>
    </>
  );
}

export type GraphSnapshotFlowNodeDetailsProps = ComponentProps<"section"> & {
  node: Node;
  graph: GraphSnapshot;
};

export function GraphSnapshotFlowNodeDetails({
  node,
  graph,
  style,
  ...rest
}: GraphSnapshotFlowNodeDetailsProps) {
  const merged = useMemo(() => ({ ...panelBaseStyle, ...style }), [style]);

  if (node.type === "offer") {
    const data = node.data as DagOfferNodeData;
    const o = data.detail;
    const bindsFromOffer = graph.binds.filter((b) => b.offerId === o.id);
    return (
      <section
        {...rest}
        style={merged}
        onPointerDown={(e) => {
          e.stopPropagation();
          rest.onPointerDown?.(e);
        }}
        aria-label={rest["aria-label"] ?? "Offer details"}
      >
        <div style={titleStyle}>Offer</div>
        <dl style={dlGridStyle}>
          <dt style={dtStyle}>Id</dt>
          <dd style={ddStyle}>
            <code>{o.id}</code>
          </dd>
          <dt style={dtStyle}>Type</dt>
          <dd style={ddStyle}>{o.type}</dd>
          <dt style={dtStyle}>Party</dt>
          <dd style={ddStyle}>{o.partyName ?? o.partyId ?? "—"}</dd>
          <dt style={dtStyle}>Expires (UTC)</dt>
          <dd style={ddStyle}>{formatTs(o.tsExpired)}</dd>
          <dt style={dtStyle}>Expired</dt>
          <dd style={ddStyle}>{o.expired ? "yes" : "no"}</dd>
        </dl>
        {bindsFromOffer.length === 0 ? (
          <>
            <div style={{ ...titleStyle, marginTop: "0.45rem" }}>Counterparty bind payload</div>
            <p style={{ margin: "0.25rem 0 0", fontSize: 12, color: "#666" }}>
              No bind on this offer (e.g. genesis extend or bind-only port with no policy answers).
            </p>
          </>
        ) : (
          bindsFromOffer.map((b) => (
            <div key={`${b.portId}`}>
              <div style={{ ...titleStyle, marginTop: "0.45rem" }}>Bound counterparty port</div>
              <dl style={dlGridStyle}>
                <dt style={dtStyle}>Port id</dt>
                <dd style={ddStyle}>
                  <code>{b.portId}</code>
                </dd>
              </dl>
              <JsonBlock label="counterparty_bind (submitted)" value={b.counterparty_bind} />
              {b.bind_policy_snapshot !== undefined ? (
                <JsonBlock label="bind_policy_snapshot (at bind)" value={b.bind_policy_snapshot} />
              ) : null}
            </div>
          ))
        )}
      </section>
    );
  }
  if (node.type === "port") {
    const data = node.data as DagPortNodeData;
    const p = data.detail;
    return (
      <section
        {...rest}
        style={merged}
        onPointerDown={(e) => {
          e.stopPropagation();
          rest.onPointerDown?.(e);
        }}
        aria-label={rest["aria-label"] ?? "Port details"}
      >
        <div style={titleStyle}>Port</div>
        <dl style={dlGridStyle}>
          <dt style={dtStyle}>Id</dt>
          <dd style={ddStyle}>
            <code>{p.id}</code>
          </dd>
          <dt style={dtStyle}>Type</dt>
          <dd style={ddStyle}>{p.type}</dd>
          <dt style={dtStyle}>Description</dt>
          <dd style={{ ...ddStyle, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
            {p.description || "—"}
          </dd>
          <dt style={dtStyle}>Terminal</dt>
          <dd style={ddStyle}>{p.terminal ? "yes" : "no"}</dd>
          <dt style={dtStyle}>Max bindings</dt>
          <dd style={ddStyle}>{p.maxBindings}</dd>
          <dt style={dtStyle}>Bind count</dt>
          <dd style={ddStyle}>{p.bindCount}</dd>
          <dt style={dtStyle}>Ref</dt>
          <dd style={ddStyle}>{p.ref.trim() === "" ? "—" : p.ref}</dd>
          <dt style={dtStyle}>Exposed on offers</dt>
          <dd style={{ ...ddStyle, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
            <code>{p.exposedOnOfferIds.join(", ") || "—"}</code>
          </dd>
          <dt style={dtStyle}>Expires (UTC)</dt>
          <dd style={ddStyle}>{formatTs(p.tsExpired)}</dd>
          <dt style={dtStyle}>Expired</dt>
          <dd style={ddStyle}>{p.expired ? "yes" : "no"}</dd>
        </dl>
        <JsonBlock label="bind_policy (counterparty must satisfy)" value={p.bind_policy} />
      </section>
    );
  }
  return null;
}

export type GraphSnapshotFlowEdgeDetailsProps = ComponentProps<"section"> & {
  edge: Edge;
};

export function GraphSnapshotFlowEdgeDetails({
  edge,
  style,
  ...rest
}: GraphSnapshotFlowEdgeDetailsProps) {
  const data = edge.data as DagBindEdgeData | undefined;
  const d = data?.detail;
  const merged = useMemo(() => ({ ...panelBaseStyle, ...style }), [style]);

  if (d === undefined) {
    return null;
  }
  return (
    <section
      {...rest}
      style={merged}
      onPointerDown={(e) => {
        e.stopPropagation();
        rest.onPointerDown?.(e);
      }}
      aria-label={rest["aria-label"] ?? "Bind edge details"}
    >
      <div style={titleStyle}>Bind</div>
      <dl style={dlGridStyle}>
        <dt style={dtStyle}>Offer id</dt>
        <dd style={ddStyle}>
          <code>{d.offerId}</code>
        </dd>
        <dt style={dtStyle}>Port id</dt>
        <dd style={ddStyle}>
          <code>{d.portId}</code>
        </dd>
      </dl>
      <JsonBlock label="bind_policy_snapshot (at bind)" value={d.bind_policy_snapshot} />
      <JsonBlock label="counterparty_bind" value={d.counterparty_bind} />
    </section>
  );
}

export type GraphSnapshotFlowEmptySelectionHintProps = ComponentProps<"div">;

export function GraphSnapshotFlowEmptySelectionHint({
  style,
  ...rest
}: GraphSnapshotFlowEmptySelectionHintProps) {
  return (
    <div
      {...rest}
      style={{ ...hintPanelStyle, ...style }}
      onPointerDown={(e) => {
        e.stopPropagation();
        rest.onPointerDown?.(e);
      }}
    >
      Click an offer, port, or bind edge (dashed). Ports expose bind_policy; offers show
      counterparty_bind for binds; dashed edges summarize bind payload and snapshot.
    </div>
  );
}

type FlowSelection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;

const OfferNode = memo(function OfferNodeFn(props: NodeProps) {
  const data = props.data as DagOfferNodeData;
  return (
    <div
      style={{
        ...cardStyle,
        padding: "8px 12px",
        fontSize: 11,
        minWidth: 200,
        maxWidth: 280,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        cursor: "pointer",
        outline: props.selected ? "2px solid #1565c0" : undefined,
        outlineOffset: 2,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#333" }} />
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#525252",
        }}
      >
        {data.partyLabel}
      </div>
      <div style={{ fontWeight: 600, marginTop: 4 }}>{data.title}</div>
      <div style={{ fontSize: 10, color: "#404040", wordBreak: "break-word", marginTop: 2 }}>
        {data.subtitle}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: "#333" }} />
    </div>
  );
});

const PortNode = memo(function PortNodeFn(props: NodeProps) {
  const data = props.data as DagPortNodeData;
  return (
    <div
      style={{
        ...cardStyle,
        padding: "8px 12px",
        fontSize: 11,
        minWidth: 140,
        maxWidth: 220,
        background: "#fafafa",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        cursor: "pointer",
        outline: props.selected ? "2px solid #1565c0" : undefined,
        outlineOffset: 2,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#333" }} />
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#525252",
        }}
      >
        {data.partyLabel}
      </div>
      <div style={{ fontWeight: 600, marginTop: 4 }}>{data.title}</div>
      <div style={{ fontSize: 10, color: "#404040", wordBreak: "break-word", marginTop: 2 }}>
        {data.subtitle}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: "#333" }} />
    </div>
  );
});

export const graphSnapshotFlowDefaultNodeTypes = {
  offer: OfferNode,
  port: PortNode,
} satisfies NodeTypes;

type GraphSnapshotFlowContextValue = {
  graph: GraphSnapshot;
  focusSceneKey: string;
  nodes: Node[];
  edges: Edge[];
  setNodes: ReturnType<typeof useNodesState<Node>>[1];
  setEdges: ReturnType<typeof useEdgesState<Edge>>[1];
  onNodesChange: ReturnType<typeof useNodesState<Node>>[2];
  onEdgesChange: ReturnType<typeof useEdgesState<Edge>>[2];
  selection: FlowSelection;
  setSelection: (s: FlowSelection) => void;
  selectedNode: Node | undefined;
  selectedEdge: Edge | undefined;
  defaultNodeTypes: typeof graphSnapshotFlowDefaultNodeTypes;
};

const GraphSnapshotFlowContext = createContext<GraphSnapshotFlowContextValue | null>(null);

export function useGraphSnapshotFlow(): GraphSnapshotFlowContextValue {
  const v = useContext(GraphSnapshotFlowContext);
  if (v === null) {
    throw new Error("useGraphSnapshotFlow must be used under GraphSnapshotFlow.Root");
  }
  return v;
}

function GraphSnapshotFlowFitEffect({
  nodes,
  edges,
  selection,
  focusSceneKey,
}: {
  nodes: Node[];
  edges: Edge[];
  selection: FlowSelection;
  focusSceneKey: string;
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }
    let cancelled = false;
    const id = browserFrame.requestAnimationFrame(() => {
      browserFrame.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        if (selection?.kind === "edge") {
          const edge = edges.find((e) => e.id === selection.id);
          if (edge !== undefined) {
            const src = nodes.find((n) => n.id === edge.source);
            const tgt = nodes.find((n) => n.id === edge.target);
            const subset = [src, tgt].filter((x): x is Node => x !== undefined);
            if (subset.length > 0) {
              fitView({
                nodes: subset,
                padding: 0.34,
                duration: 260,
                maxZoom: 2,
              });
            }
          }
          return;
        }
        if (selection?.kind === "node") {
          const picked = nodes.find((n) => n.id === selection.id);
          if (picked !== undefined) {
            fitView({
              nodes: [picked],
              padding: 0.36,
              duration: 260,
              maxZoom: 2,
            });
          }
          return;
        }
        const want =
          focusSceneKey === ""
            ? []
            : focusSceneKey.split("\u001e").filter((fid) => nodes.some((n) => n.id === fid));
        if (want.length > 0) {
          const subset = nodes.filter((n) => want.includes(n.id));
          fitView({ nodes: subset, padding: 0.28, duration: 280, maxZoom: 1.75 });
        } else {
          fitView({ padding: 0.15, duration: 200 });
        }
      });
    });
    return () => {
      cancelled = true;
      browserFrame.cancelAnimationFrame(id);
    };
  }, [nodes, edges, fitView, focusSceneKey, selection]);

  return null;
}

export type GraphSnapshotFlowRootProps = Omit<ComponentProps<"div">, "children"> & {
  graph: GraphSnapshot;
  /** When set, viewport fits that subgraph when nothing is selected. */
  focusNodeIds?: string[] | null;
  children: ReactNode;
};

function GraphSnapshotFlowStateProvider({
  graph,
  focusNodeIds,
  children,
}: Pick<GraphSnapshotFlowRootProps, "graph" | "focusNodeIds" | "children">) {
  const layout = useMemo(() => graphSnapshotToFlow(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selection, setSelection] = useState<FlowSelection>(null);

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
    (): GraphSnapshotFlowContextValue => ({
      graph,
      focusSceneKey,
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
      defaultNodeTypes: graphSnapshotFlowDefaultNodeTypes,
    }),
    [
      graph,
      focusSceneKey,
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

  return (
    <GraphSnapshotFlowContext.Provider value={value}>
      <div style={canvasShellStyle}>{children}</div>
    </GraphSnapshotFlowContext.Provider>
  );
}

export function GraphSnapshotFlowRoot({
  graph,
  focusNodeIds = null,
  style,
  children,
  ...rest
}: GraphSnapshotFlowRootProps) {
  return (
    <div {...rest} style={{ ...hostStyleDefault, ...style }}>
      <ReactFlowProvider>
        <GraphSnapshotFlowStateProvider graph={graph} focusNodeIds={focusNodeIds}>
          {children}
        </GraphSnapshotFlowStateProvider>
      </ReactFlowProvider>
    </div>
  );
}

export type GraphSnapshotFlowViewportProps = Omit<
  ComponentProps<typeof ReactFlow>,
  "nodes" | "edges" | "onNodesChange" | "onEdgesChange"
> & {
  nodes?: ComponentProps<typeof ReactFlow>["nodes"];
  edges?: ComponentProps<typeof ReactFlow>["edges"];
  onNodesChange?: ComponentProps<typeof ReactFlow>["onNodesChange"];
  onEdgesChange?: ComponentProps<typeof ReactFlow>["onEdgesChange"];
};

export function GraphSnapshotFlowViewport({
  nodeTypes,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  style,
  children,
  nodes: nodesProp,
  edges: edgesProp,
  onNodesChange: onNodesChangeProp,
  onEdgesChange: onEdgesChangeProp,
  ...rest
}: GraphSnapshotFlowViewportProps) {
  const ctx = useGraphSnapshotFlow();

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

  const defaultMarker = {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: "#262626",
  } as const;

  return (
    <ReactFlow
      {...rest}
      style={{ width: "100%", height: "100%", ...style }}
      nodes={nodesProp ?? ctx.nodes}
      edges={edgesProp ?? ctx.edges}
      nodeTypes={nodeTypes ?? ctx.defaultNodeTypes}
      onNodesChange={onNodesChangeProp ?? ctx.onNodesChange}
      onEdgesChange={onEdgesChangeProp ?? ctx.onEdgesChange}
      nodesDraggable={rest.nodesDraggable ?? false}
      nodesConnectable={rest.nodesConnectable ?? false}
      elementsSelectable={rest.elementsSelectable ?? true}
      colorMode={rest.colorMode ?? "light"}
      minZoom={rest.minZoom ?? 0.001}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      onPaneClick={handlePaneClick}
      defaultEdgeOptions={{
        markerEnd: defaultMarker,
        ...rest.defaultEdgeOptions,
      }}
    >
      <GraphSnapshotFlowFitEffect
        nodes={ctx.nodes}
        edges={ctx.edges}
        selection={ctx.selection}
        focusSceneKey={ctx.focusSceneKey}
      />
      {children}
    </ReactFlow>
  );
}

export type GraphSnapshotFlowBackgroundProps = ComponentProps<typeof Background>;

export function GraphSnapshotFlowBackground(props: GraphSnapshotFlowBackgroundProps) {
  return <Background gap={20} size={1} color="#e5e5e5" {...props} />;
}

export type GraphSnapshotFlowControlsProps = ComponentProps<typeof Controls>;

export function GraphSnapshotFlowControls(props: GraphSnapshotFlowControlsProps) {
  return <Controls showInteractive={false} {...props} />;
}

export type GraphSnapshotFlowSelectionPanelProps = ComponentProps<typeof Panel>;

export function GraphSnapshotFlowSelectionPanel({
  position = "top-right",
  ...rest
}: GraphSnapshotFlowSelectionPanelProps) {
  const { selectedEdge, selectedNode, graph } = useGraphSnapshotFlow();
  return (
    <Panel position={position} {...rest}>
      {selectedEdge !== undefined ? (
        <GraphSnapshotFlowEdgeDetails edge={selectedEdge} />
      ) : selectedNode !== undefined ? (
        <GraphSnapshotFlowNodeDetails node={selectedNode} graph={graph} />
      ) : (
        <GraphSnapshotFlowEmptySelectionHint />
      )}
    </Panel>
  );
}

export type GraphSnapshotFlowDefaultLayoutProps = Omit<GraphSnapshotFlowRootProps, "children">;

export function GraphSnapshotFlowDefaultLayout(props: GraphSnapshotFlowDefaultLayoutProps) {
  return (
    <GraphSnapshotFlowRoot {...props}>
      <GraphSnapshotFlowViewport>
        <GraphSnapshotFlowBackground />
        <GraphSnapshotFlowControls />
        <GraphSnapshotFlowSelectionPanel />
      </GraphSnapshotFlowViewport>
    </GraphSnapshotFlowRoot>
  );
}

/** Compound components for visualizing a `GraphSnapshot` with React Flow. */
export const GraphSnapshotFlow = {
  Root: GraphSnapshotFlowRoot,
  Viewport: GraphSnapshotFlowViewport,
  Background: GraphSnapshotFlowBackground,
  Controls: GraphSnapshotFlowControls,
  SelectionPanel: GraphSnapshotFlowSelectionPanel,
  NodeDetails: GraphSnapshotFlowNodeDetails,
  EdgeDetails: GraphSnapshotFlowEdgeDetails,
  EmptySelectionHint: GraphSnapshotFlowEmptySelectionHint,
  DefaultLayout: GraphSnapshotFlowDefaultLayout,
} as const;
