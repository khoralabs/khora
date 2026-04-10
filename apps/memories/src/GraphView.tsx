import { Billboard, OrbitControls, Text, useCursor } from "@react-three/drei";
import { Canvas, events as createPointerEvents } from "@react-three/fiber";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type GraphPayload = {
  namespace: string;
  nodes: Array<{ key: string; x: number; y: number; z: number; labels: string[] }>;
  edges: Array<{ edgeId: string; fromKey: string; toKey: string; labels: string[] }>;
};

/** When set, nodes/edges outside `relevantKeys` (hits ∪ neighbors) are dimmed. */
export type GraphSearchState = {
  relevantKeys: ReadonlySet<string>;
  hitCount: number;
};

const SEARCH_DIM_NODE = 0.2;
const SEARCH_DIM_LINE = 0.12;
const SEARCH_DIM_LABEL = 0.32;

type HoverTarget =
  | { type: "node"; key: string }
  | { type: "edge"; edgeId: string; fromKey: string; toKey: string };

type EdgePreviewResponse = {
  edgeId: string;
  fromKey: string;
  toKey: string;
  labels: string[];
  properties: Record<string, unknown> | null;
};

function positionsMap(data: GraphPayload): Map<string, [number, number, number]> {
  const pos = new Map<string, [number, number, number]>();
  for (const n of data.nodes) {
    pos.set(n.key, [n.x, n.y, n.z]);
  }
  return pos;
}

/** Node sphere radius (must match `Scene` mesh). */
const NODE_SPHERE_RADIUS = 0.04;

/** Radius of invisible pick volume along each edge (world units). */
const EDGE_PICK_RADIUS = 0.042;

/**
 * Trim edge pick cylinders at endpoints so they do not overlap node spheres;
 * otherwise the edge often wins raycast when hovering near/inside a node.
 */
const EDGE_PICK_ENDPOINT_INSET = NODE_SPHERE_RADIUS + 0.016;

/** `userData.graphHit` on node meshes; pointer filter prefers these over edges. */
const GRAPH_HIT_NODE = "node";

function graphPointerEvents(store: Parameters<typeof createPointerEvents>[0]) {
  const base = createPointerEvents(store);
  return {
    ...base,
    filter: (items: THREE.Intersection[]) => {
      const nodeHits = items.filter((i) => i.object.userData?.graphHit === GRAPH_HIT_NODE);
      if (nodeHits.length > 0) {
        nodeHits.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
        const first = nodeHits[0];
        return first ? [first] : items;
      }
      return items;
    },
  };
}

type EdgeGeom = {
  edgeId: string;
  fromKey: string;
  toKey: string;
  a: THREE.Vector3;
  b: THREE.Vector3;
};

function buildEdgeItems(data: GraphPayload): EdgeGeom[] {
  const pos = positionsMap(data);
  const out: EdgeGeom[] = [];
  for (const e of data.edges) {
    const pa = pos.get(e.fromKey);
    const pb = pos.get(e.toKey);
    if (!pa || !pb) continue;
    const a = new THREE.Vector3(...pa);
    const b = new THREE.Vector3(...pb);
    if (a.distanceToSquared(b) < 1e-10) continue;
    out.push({
      edgeId: e.edgeId,
      fromKey: e.fromKey,
      toKey: e.toKey,
      a,
      b,
    });
  }
  return out;
}

function EdgeItem({
  edgeId,
  fromKey,
  toKey,
  a,
  b,
  hovered,
  searchDimmed,
  onEdgeOver,
  onEdgeOut,
}: EdgeGeom & {
  hovered: boolean;
  searchDimmed: boolean;
  onEdgeOver: (edgeId: string, fromKey: string, toKey: string) => void;
  onEdgeOut: () => void;
}) {
  const lineRef = useRef<THREE.LineSegments>(null);
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (line) line.raycast = () => {};
  }, []);

  const visual = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    return { mid, len, quat };
  }, [a, b]);

  const pick = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const fullLen = dir.length();
    if (fullLen < 1e-8) return null;
    const n = dir.clone().divideScalar(fullLen);
    const inset = Math.min(EDGE_PICK_ENDPOINT_INSET, fullLen * 0.5 - 1e-4);
    if (inset <= 0 || fullLen <= 2 * inset + 1e-4) return null;
    const aPick = a.clone().addScaledVector(n, inset);
    const bPick = b.clone().addScaledVector(n, -inset);
    const lenPick = aPick.distanceTo(bPick);
    const midPick = aPick.clone().add(bPick).multiplyScalar(0.5);
    const quatPick = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      bPick.clone().sub(aPick).normalize(),
    );
    return { midPick, lenPick, quatPick };
  }, [a, b]);

  const half = visual.len * 0.5;
  const linePos = useMemo(
    () => new Float32Array([0, -half, 0, 0, half, 0]),
    [half],
  );

  const lineOpacity = hovered ? 1 : searchDimmed ? SEARCH_DIM_LINE : 0.85;

  return (
    <>
      <group position={visual.mid} quaternion={visual.quat}>
        <lineSegments ref={lineRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[linePos, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            color={hovered ? "#9ec5ff" : "#666666"}
            transparent
            opacity={lineOpacity}
          />
        </lineSegments>
      </group>
      {pick ? (
        <group position={pick.midPick} quaternion={pick.quatPick}>
          <mesh
            userData={{ graphHit: "edge" }}
            onPointerOver={(e) => {
              e.stopPropagation();
              onEdgeOver(edgeId, fromKey, toKey);
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              onEdgeOut();
            }}
          >
            <cylinderGeometry args={[EDGE_PICK_RADIUS, EDGE_PICK_RADIUS, pick.lenPick, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ) : null}
    </>
  );
}

function EdgesInteractive({
  data,
  hoveredEdgeId,
  edgeLit,
  onEdgeOver,
  onEdgeOut,
}: {
  data: GraphPayload;
  hoveredEdgeId: string | null;
  edgeLit: (fromKey: string, toKey: string) => boolean;
  onEdgeOver: (edgeId: string, fromKey: string, toKey: string) => void;
  onEdgeOut: () => void;
}) {
  const items = useMemo(() => buildEdgeItems(data), [data]);
  return (
    <>
      {items.map((item) => (
        <EdgeItem
          key={item.edgeId}
          {...item}
          hovered={hoveredEdgeId === item.edgeId}
          searchDimmed={!edgeLit(item.fromKey, item.toKey)}
          onEdgeOver={onEdgeOver}
          onEdgeOut={onEdgeOut}
        />
      ))}
    </>
  );
}

function formatLabels(labels: string[]): string {
  return labels.join(" · ");
}

/** World-space label sizing: stays consistent with spheres/lines under orbit + zoom. */
const NODE_FONT = 0.028;
const EDGE_FONT = 0.019;

function ellipsize(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 1))}…`;
}

/** Troika text meshes otherwise capture raycasts and block node hover. */
function NodeLabelText({
  dimmed = false,
  ...props
}: ComponentProps<typeof Text> & { dimmed?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (m) m.raycast = () => {};
  }, []);
  return (
    <Text
      ref={ref}
      fillOpacity={dimmed ? SEARCH_DIM_LABEL : 1}
      outlineOpacity={dimmed ? 0.12 : 1}
      {...props}
    />
  );
}

function NodeLabels({
  data,
  nodeLit,
}: {
  data: GraphPayload;
  nodeLit: (key: string) => boolean;
}) {
  return (
    <>
      {data.nodes.map((n) => {
        const raw = formatLabels(n.labels);
        if (!raw) return null;
        const text = ellipsize(raw, 80);
        return (
          <Billboard key={n.key} position={[n.x, n.y + 0.07, n.z]} follow>
            <NodeLabelText
              dimmed={!nodeLit(n.key)}
              fontSize={NODE_FONT}
              color="#c4c4cc"
              outlineWidth={0.012}
              outlineColor="#0a0a0f"
              maxWidth={0.55}
              textAlign="center"
              anchorX="center"
              anchorY="bottom"
              whiteSpace="overflowWrap"
            >
              {text}
            </NodeLabelText>
          </Billboard>
        );
      })}
    </>
  );
}

function EdgeLabels({
  data,
  edgeLit,
}: {
  data: GraphPayload;
  edgeLit: (fromKey: string, toKey: string) => boolean;
}) {
  const items = useMemo(() => {
    const pos = positionsMap(data);
    const out: Array<{
      edgeId: string;
      fromKey: string;
      toKey: string;
      mid: [number, number, number];
      text: string;
    }> = [];
    for (let i = 0; i < data.edges.length; i++) {
      const e = data.edges[i];
      if (!e) continue;
      const text = formatLabels(e.labels);
      if (!text) continue;
      const a = pos.get(e.fromKey);
      const b = pos.get(e.toKey);
      if (!a || !b) continue;
      const va = new THREE.Vector3(...a);
      const vb = new THREE.Vector3(...b);
      const mid = va.lerp(vb, 0.5);
      out.push({
        edgeId: e.edgeId,
        fromKey: e.fromKey,
        toKey: e.toKey,
        mid: [mid.x, mid.y, mid.z],
        text,
      });
    }
    return out;
  }, [data]);

  return (
    <>
      {items.map((item) => {
        const text = ellipsize(item.text, 48);
        const dimmed = !edgeLit(item.fromKey, item.toKey);
        return (
          <Billboard key={item.edgeId} position={item.mid} follow>
            <NodeLabelText
              dimmed={dimmed}
              fontSize={EDGE_FONT}
              color="#a1a1aa"
              outlineWidth={0.012}
              outlineColor="#0a0a0f"
              maxWidth={0.4}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
              whiteSpace="overflowWrap"
            >
              {text}
            </NodeLabelText>
          </Billboard>
        );
      })}
    </>
  );
}

function Scene({
  data,
  graphSearch,
  hoverNodeKey,
  hoveredEdgeId,
  cursorActive,
  onNodeOver,
  onNodeOut,
  onEdgeOver,
  onEdgeOut,
}: {
  data: GraphPayload;
  graphSearch: GraphSearchState | null;
  hoverNodeKey: string | null;
  hoveredEdgeId: string | null;
  cursorActive: boolean;
  onNodeOver: (key: string) => void;
  onNodeOut: () => void;
  onEdgeOver: (edgeId: string, fromKey: string, toKey: string) => void;
  onEdgeOut: () => void;
}) {
  useCursor(cursorActive);

  const { nodeLit, edgeLit } = useMemo(() => {
    if (!graphSearch) {
      const t = () => true;
      return { nodeLit: t, edgeLit: (_f: string, _t: string) => true };
    }
    const keys = graphSearch.relevantKeys;
    return {
      nodeLit: (k: string) => keys.has(k),
      edgeLit: (f: string, t: string) => keys.has(f) && keys.has(t),
    };
  }, [graphSearch]);

  const positions = useMemo(
    () =>
      data.nodes.map((n) => ({
        key: n.key,
        p: new THREE.Vector3(n.x, n.y, n.z),
      })),
    [data.nodes],
  );

  return (
    <>
      <color attach="background" args={["#0a0a0f"]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[4, 4, 4]} intensity={0.8} />
      <pointLight position={[-4, -2, -4]} intensity={0.3} />
      <EdgesInteractive
        data={data}
        hoveredEdgeId={hoveredEdgeId}
        edgeLit={edgeLit}
        onEdgeOver={onEdgeOver}
        onEdgeOut={onEdgeOut}
      />
      {positions.map(({ key, p }) => {
        const nodeDimmed = graphSearch !== null && !nodeLit(key);
        return (
          <mesh
            key={key}
            position={p}
            userData={{ graphHit: GRAPH_HIT_NODE }}
            onPointerOver={(e) => {
              e.stopPropagation();
              onNodeOver(key);
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              onNodeOut();
            }}
          >
            <sphereGeometry args={[NODE_SPHERE_RADIUS, 20, 20]} />
            <meshStandardMaterial
              transparent
              opacity={hoverNodeKey === key ? 1 : nodeDimmed ? SEARCH_DIM_NODE : 1}
              color="#6ea8ff"
              emissive={hoverNodeKey === key ? "#2244aa" : "#000000"}
              emissiveIntensity={hoverNodeKey === key ? 0.45 : 0}
            />
          </mesh>
        );
      })}
      <NodeLabels data={data} nodeLit={nodeLit} />
      <EdgeLabels data={data} edgeLit={edgeLit} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
    </>
  );
}

function PreviewPanel({
  namespace,
  hover,
  nodePreview,
  nodeLoading,
  edgeDetail,
  edgeLoading,
  onMouseEnter,
  onMouseLeave,
}: {
  namespace: string;
  hover: HoverTarget | null;
  nodePreview: string | null;
  nodeLoading: boolean;
  edgeDetail: EdgePreviewResponse | null;
  edgeLoading: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  if (!hover) return null;

  const aria =
    hover.type === "node" ? "Memory source preview" : "Edge properties preview";

  return (
    <section
      aria-label={aria}
      className="pointer-events-auto fixed bottom-4 right-4 z-30 flex max-h-[min(50vh,420px)] w-[min(28rem,calc(100vw-2rem))] flex-col rounded-lg border border-border/60 bg-background/95 p-3 text-left shadow-lg backdrop-blur-md"
      onPointerEnter={onMouseEnter}
      onPointerLeave={onMouseLeave}
    >
      {hover.type === "node" ? (
        <>
          <div className="mb-1 font-mono text-[10px] text-muted-foreground">
            {namespace} <span className="text-foreground">·</span>{" "}
            <span className="text-foreground">{hover.key}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-foreground">
            {nodeLoading ? (
              <span className="text-muted-foreground">Loading…</span>
            ) : nodePreview ? (
              <pre className="whitespace-pre-wrap break-words font-mono">{nodePreview}</pre>
            ) : (
              <span className="text-muted-foreground">No text content for this memory.</span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mb-1 font-mono text-[10px] text-muted-foreground">
            edge <span className="text-foreground">{hover.fromKey}</span>
            <span className="text-muted-foreground"> → </span>
            <span className="text-foreground">{hover.toKey}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-foreground">
            {edgeLoading ? (
              <span className="text-muted-foreground">Loading…</span>
            ) : edgeDetail ? (
              <>
                {edgeDetail.labels.length > 0 ? (
                  <div className="mb-2 text-[10px] text-muted-foreground">
                    labels:{" "}
                    <span className="text-foreground">{edgeDetail.labels.join(" · ")}</span>
                  </div>
                ) : null}
                {edgeDetail.properties !== null && Object.keys(edgeDetail.properties).length > 0 ? (
                  <pre className="whitespace-pre-wrap break-words font-mono">
                    {JSON.stringify(edgeDetail.properties, null, 2)}
                  </pre>
                ) : (
                  <span className="text-muted-foreground">No properties on this edge.</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Could not load edge.</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function GraphView({
  data,
  namespace,
  graphSearch = null,
}: {
  data: GraphPayload;
  namespace: string;
  graphSearch?: GraphSearchState | null;
}) {
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [nodePreview, setNodePreview] = useState<string | null>(null);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [edgeDetail, setEdgeDetail] = useState<EdgePreviewResponse | null>(null);
  const [edgeLoading, setEdgeLoading] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClearHover = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const scheduleClearHover = useCallback(() => {
    cancelClearHover();
    clearTimerRef.current = setTimeout(() => setHover(null), 280);
  }, [cancelClearHover]);

  const onNodeOver = useCallback(
    (key: string) => {
      cancelClearHover();
      setHover({ type: "node", key });
    },
    [cancelClearHover],
  );

  const onNodeOut = useCallback(() => {
    scheduleClearHover();
  }, [scheduleClearHover]);

  const onEdgeOver = useCallback(
    (edgeId: string, fromKey: string, toKey: string) => {
      cancelClearHover();
      setHover({ type: "edge", edgeId, fromKey, toKey });
    },
    [cancelClearHover],
  );

  const onEdgeOut = useCallback(() => {
    scheduleClearHover();
  }, [scheduleClearHover]);

  useEffect(() => {
    if (!hover) {
      setNodePreview(null);
      setEdgeDetail(null);
      setNodeLoading(false);
      setEdgeLoading(false);
      return;
    }
    const ac = new AbortController();
    if (hover.type === "node") {
      setEdgeDetail(null);
      setEdgeLoading(false);
      setNodeLoading(true);
      setNodePreview(null);
      void fetch(
        `/api/memory-preview?namespace=${encodeURIComponent(namespace)}&key=${encodeURIComponent(hover.key)}`,
        { signal: ac.signal },
      )
        .then((res) => res.json() as Promise<{ preview?: string | null; error?: string }>)
        .then((json) => {
          if (!ac.signal.aborted) setNodePreview(json.preview ?? null);
        })
        .catch(() => {
          if (!ac.signal.aborted) setNodePreview(null);
        })
        .finally(() => {
          if (!ac.signal.aborted) setNodeLoading(false);
        });
    } else {
      setNodePreview(null);
      setNodeLoading(false);
      setEdgeLoading(true);
      setEdgeDetail(null);
      void fetch(
        `/api/edge-preview?namespace=${encodeURIComponent(namespace)}&edgeId=${encodeURIComponent(hover.edgeId)}`,
        { signal: ac.signal },
      )
        .then(async (res) => {
          const json = (await res.json()) as EdgePreviewResponse & { error?: string };
          if (ac.signal.aborted) return;
          if (
            res.ok &&
            typeof json.edgeId === "string" &&
            typeof json.fromKey === "string" &&
            typeof json.toKey === "string"
          ) {
            setEdgeDetail({
              edgeId: json.edgeId,
              fromKey: json.fromKey,
              toKey: json.toKey,
              labels: Array.isArray(json.labels) ? json.labels : [],
              properties:
                json.properties !== undefined && json.properties !== null &&
                typeof json.properties === "object" && !Array.isArray(json.properties)
                  ? (json.properties as Record<string, unknown>)
                  : null,
            });
          } else setEdgeDetail(null);
        })
        .catch(() => {
          if (!ac.signal.aborted) setEdgeDetail(null);
        })
        .finally(() => {
          if (!ac.signal.aborted) setEdgeLoading(false);
        });
    }
    return () => ac.abort();
  }, [hover, namespace]);

  const hoverNodeKey = hover?.type === "node" ? hover.key : null;
  const hoveredEdgeId = hover?.type === "edge" ? hover.edgeId : null;

  return (
    <div className="relative h-full w-full">
      <PreviewPanel
        namespace={namespace}
        hover={hover}
        nodePreview={nodePreview}
        nodeLoading={nodeLoading}
        edgeDetail={edgeDetail}
        edgeLoading={edgeLoading}
        onMouseEnter={cancelClearHover}
        onMouseLeave={() => setHover(null)}
      />
      <Canvas
        className="absolute inset-0 block h-full w-full"
        camera={{ position: [2.2, 2.2, 2.2], fov: 50, near: 0.01, far: 100 }}
        dpr={[1, 2]}
        events={graphPointerEvents}
      >
        <Scene
          data={data}
          graphSearch={graphSearch}
          hoverNodeKey={hoverNodeKey}
          hoveredEdgeId={hoveredEdgeId}
          cursorActive={hover !== null}
          onNodeOver={onNodeOver}
          onNodeOut={onNodeOut}
          onEdgeOver={onEdgeOver}
          onEdgeOut={onEdgeOut}
        />
      </Canvas>
    </div>
  );
}
