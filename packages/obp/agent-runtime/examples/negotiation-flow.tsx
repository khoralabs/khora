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
  type DagBindEdgeData,
  type DagOfferNodeData,
  type DagPortNodeData,
  graphSnapshotToFlow,
} from "./obp-graph-layout.ts";
import "@xyflow/react/dist/style.css";
import { memo, type ReactNode, useEffect, useMemo, useState } from "react";

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

function DagDetailBillboard({ node, graph }: { node: Node; graph: GraphSnapshot }) {
  if (node.type === "offer") {
    const data = node.data as DagOfferNodeData;
    const o = data.detail;
    const bindsFromOffer = graph.binds.filter((b) => b.offerId === o.id);
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
        {bindsFromOffer.length === 0 ? (
          <>
            <div className="dag-detail-billboard__title" style={{ marginTop: "0.45rem" }}>
              Counterparty bind payload
            </div>
            <p className="dag-detail-billboard__muted" style={{ margin: "0.25rem 0 0", fontSize: 12 }}>
              No bind on this offer (e.g. genesis extend or bind-only port with no policy answers).
            </p>
          </>
        ) : (
          bindsFromOffer.map((b, i) => (
            <div key={`${b.portId}:${i}`}>
              <div className="dag-detail-billboard__title" style={{ marginTop: "0.45rem" }}>
                Bound counterparty port
              </div>
              <dl className="dag-detail-billboard__dl">
                <dt>Port id</dt>
                <dd>
                  <code>{b.portId}</code>
                </dd>
              </dl>
              {jsonBlock("counterparty_bind (submitted)", b.counterparty_bind)}
              {b.bind_policy !== undefined
                ? jsonBlock("bind_policy (snapshot at bind)", b.bind_policy)
                : null}
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
          <dt>Description</dt>
          <dd className="dag-detail-billboard__wrap">{p.description || "—"}</dd>
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
        {jsonBlock("bind_policy (counterparty must satisfy)", p.bind_policy)}
      </section>
    );
  }
  return null;
}

function jsonBlock(label: string, value: unknown): ReactNode {
  const text = value === undefined ? "—" : JSON.stringify(value, null, 2);
  return (
    <>
      <div className="dag-detail-billboard__title" style={{ marginTop: "0.45rem" }}>
        {label}
      </div>
      <pre className="dag-detail-billboard__pre">{text}</pre>
    </>
  );
}

function DagBindEdgeBillboard({ edge }: { edge: Edge }) {
  const data = edge.data as DagBindEdgeData | undefined;
  const d = data?.detail;
  if (d === undefined) {
    return null;
  }
  return (
    <section
      className="dag-detail-billboard"
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Bind edge details"
    >
      <div className="dag-detail-billboard__title">Bind</div>
      <dl className="dag-detail-billboard__dl">
        <dt>Offer id</dt>
        <dd>
          <code>{d.offerId}</code>
        </dd>
        <dt>Port id</dt>
        <dd>
          <code>{d.portId}</code>
        </dd>
      </dl>
      {jsonBlock("bind_policy (snapshot at bind)", d.bind_policy)}
      {jsonBlock("counterparty_bind", d.counterparty_bind)}
    </section>
  );
}

type FlowSelection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;

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
  const [selection, setSelection] = useState<FlowSelection>(null);
  const { fitView } = useReactFlow();

  /** Push graph into React Flow — `nodes`/`edges` props alone do not apply snapshot updates in XYFlow. */
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
      cancelAnimationFrame(id);
    };
  }, [nodes, edges, fitView, focusSceneKey, selection]);

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
      elementsSelectable
      colorMode="light"
      minZoom={0.001}
      onNodeClick={(_, node) => {
        setSelection({ kind: "node", id: node.id });
      }}
      onEdgeClick={(_, edge) => {
        setSelection({ kind: "edge", id: edge.id });
      }}
      onPaneClick={() => {
        setSelection(null);
      }}
      defaultEdgeOptions={{
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#262626" },
      }}
    >
      <Background gap={20} size={1} color="#e5e5e5" />
      <Controls showInteractive={false} />
      {selectedEdge !== undefined ? (
        <Panel position="top-right">
          <DagBindEdgeBillboard edge={selectedEdge} />
        </Panel>
      ) : selectedNode !== undefined ? (
        <Panel position="top-right">
          <DagDetailBillboard node={selectedNode} graph={graph} />
        </Panel>
      ) : (
        <Panel position="top-right">
          <div
            className="dag-detail-billboard dag-detail-billboard--hint"
            onPointerDown={(e) => e.stopPropagation()}
          >
            Click an offer, port, or bind edge (dashed). Ports show <strong>bind_policy</strong>;
            offers show <strong>counterparty_bind</strong> submitted for that bind; dashed edges show
            both.
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
