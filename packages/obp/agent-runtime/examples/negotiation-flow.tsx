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
import type { GraphSnapshot } from "./graph-snapshot.ts";
import {
  type DagOfferNodeData,
  type DagPortNodeData,
  graphSnapshotToFlow,
} from "./obp-graph-layout.ts";
import "@xyflow/react/dist/style.css";
import { memo, useEffect, useMemo, useState } from "react";

const card = {
  border: "1px solid #1a1a1a",
  background: "#fff",
  color: "#0a0a0a",
  borderRadius: 4,
} as const;

function formatTs(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
}

function DagDetailBillboard({ node }: { node: Node }) {
  if (node.type === "offer") {
    const data = node.data as DagOfferNodeData;
    const o = data.detail;
    return (
      <section
        className="dag-detail-billboard"
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Offer details"
      >
        <div className="dag-detail-billboard__title">Offer</div>
        <dl className="dag-detail-billboard__dl">
          <dt>Id</dt>
          <dd>
            <code>{o.id}</code>
          </dd>
          <dt>Type</dt>
          <dd>{o.type}</dd>
          <dt>Party</dt>
          <dd>{o.partyName ?? o.partyId ?? "—"}</dd>
          <dt>Expires (UTC)</dt>
          <dd>{formatTs(o.tsExpired)}</dd>
          <dt>Expired</dt>
          <dd>{o.expired ? "yes" : "no"}</dd>
        </dl>
      </section>
    );
  }
  if (node.type === "port") {
    const data = node.data as DagPortNodeData;
    const p = data.detail;
    return (
      <section
        className="dag-detail-billboard"
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Port details"
      >
        <div className="dag-detail-billboard__title">Port</div>
        <dl className="dag-detail-billboard__dl">
          <dt>Id</dt>
          <dd>
            <code>{p.id}</code>
          </dd>
          <dt>Type</dt>
          <dd>{p.type}</dd>
          <dt>Terminal</dt>
          <dd>{p.terminal ? "yes" : "no"}</dd>
          <dt>Max bindings</dt>
          <dd>{p.maxBindings}</dd>
          <dt>Bind count</dt>
          <dd>{p.bindCount}</dd>
          <dt>Ref</dt>
          <dd>{p.ref.trim() === "" ? "—" : p.ref}</dd>
          <dt>Exposed on offers</dt>
          <dd>
            <code className="dag-detail-billboard__wrap">
              {p.exposedOnOfferIds.join(", ") || "—"}
            </code>
          </dd>
          <dt>Expires (UTC)</dt>
          <dd>{formatTs(p.tsExpired)}</dd>
          <dt>Expired</dt>
          <dd>{p.expired ? "yes" : "no"}</dd>
        </dl>
      </section>
    );
  }
  return null;
}

const OfferNode = memo(function OfferNodeFn(props: NodeProps) {
  const data = props.data as DagOfferNodeData;
  return (
    <div
      style={{
        ...card,
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
        ...card,
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

const nodeTypes = {
  offer: OfferNode,
  port: PortNode,
} satisfies NodeTypes;

function NegotiationFlowInner({
  graph,
  focusNodeIds,
}: {
  graph: GraphSnapshot;
  focusNodeIds: string[] | null;
}) {
  const layout = useMemo(() => graphSnapshotToFlow(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  /** Push graph into React Flow — `nodes`/`edges` props alone do not apply snapshot updates in XYFlow. */
  useEffect(() => {
    setNodes(layout.nodes.map((n) => ({ ...n, selected: n.id === selectedId })));
    setEdges(layout.edges);
  }, [layout, selectedId, setNodes, setEdges]);

  useEffect(() => {
    if (selectedId !== null && !nodes.some((n) => n.id === selectedId)) {
      setSelectedId(null);
    }
  }, [nodes, selectedId]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId), [nodes, selectedId]);

  /** Stable across redundant `focusNodeIds` array allocations from the parent. */
  const focusSceneKey =
    focusNodeIds === null || focusNodeIds.length === 0 ? "" : focusNodeIds.join("\u001e");

  /** Prefer framing the last clicked node; otherwise frame the latest turn or the full graph. */
  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        if (selectedId !== null) {
          const picked = nodes.find((n) => n.id === selectedId);
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
      cancelAnimationFrame(id);
    };
  }, [nodes, fitView, focusSceneKey, selectedId]);

  return (
    <ReactFlow
      style={{ width: "100%", height: "100%" }}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      colorMode="light"
      minZoom={0.001}
      onNodeClick={(_, node) => {
        setSelectedId(node.id);
      }}
      onPaneClick={() => {
        setSelectedId(null);
      }}
      defaultEdgeOptions={{
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#262626" },
      }}
    >
      <Background gap={20} size={1} color="#e5e5e5" />
      <Controls showInteractive={false} />
      {selectedNode !== undefined ? (
        <Panel position="top-right">
          <DagDetailBillboard node={selectedNode} />
        </Panel>
      ) : (
        <Panel position="top-right">
          <div
            className="dag-detail-billboard dag-detail-billboard--hint"
            onPointerDown={(e) => e.stopPropagation()}
          >
            Click an offer or port for full details.
          </div>
        </Panel>
      )}
    </ReactFlow>
  );
}

export function NegotiationFlow({
  graph,
  focusNodeIds = null,
}: {
  graph: GraphSnapshot;
  /** When set (e.g. last audit’s new offer + exposed ports), viewport fits that subgraph each turn. */
  focusNodeIds?: string[] | null;
}) {
  return (
    <div className="negotiation-flow-host">
      <ReactFlowProvider>
        <NegotiationFlowInner graph={graph} focusNodeIds={focusNodeIds} />
      </ReactFlowProvider>
    </div>
  );
}
