import { Html, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type ElementRef, useMemo, useRef } from "react";
import * as THREE from "three";
import type { GraphSearchState, SceneEdge } from "./projection-types.js";
import { useProjection } from "./use-projection.js";

const EDGE_LABEL_DISTANCE_FACTOR = 5;
const PICK_RADIUS = 0.028;
/** Matches drei dashed-line examples (`dashOffset` scroll). */
const DASH_SCROLL_SPEED = 10;

function scrollDashedLineMaterial(material: unknown, delta: number) {
  if (!material || typeof material !== "object") return;
  const m = material as { uniforms?: { dashOffset?: { value: number } }; dashOffset?: number };
  if (m.uniforms?.dashOffset) {
    m.uniforms.dashOffset.value -= DASH_SCROLL_SPEED * delta;
    return;
  }
  if (typeof m.dashOffset === "number") {
    m.dashOffset -= DASH_SCROLL_SPEED * delta;
  }
}

const dashedLineDefaults = {
  color: "black" as const,
  lineWidth: 1,
  transparent: true,
  depthTest: true,
  depthWrite: false,
  renderOrder: 0,
  dashed: true,
  dashScale: 100,
  dashSize: 3,
  gapSize: 5,
};

function GraphDashedEdgeLineAnimated({
  from,
  to,
  opacity,
}: {
  from: [number, number, number];
  to: [number, number, number];
  opacity: number;
}) {
  const lineRef = useRef<ElementRef<typeof Line>>(null);
  useFrame((_, delta) => {
    const line = lineRef.current;
    if (!line) return;
    const mat = line.material;
    scrollDashedLineMaterial(Array.isArray(mat) ? mat[0] : mat, delta);
  });
  return <Line ref={lineRef} points={[from, to]} opacity={opacity} {...dashedLineDefaults} />;
}

function GraphDashedEdgeLine({
  from,
  to,
  opacity,
  animateDash,
}: {
  from: [number, number, number];
  to: [number, number, number];
  opacity: number;
  animateDash: boolean;
}) {
  return animateDash ? (
    <GraphDashedEdgeLineAnimated from={from} to={to} opacity={opacity} />
  ) : (
    <Line points={[from, to]} opacity={opacity} {...dashedLineDefaults} />
  );
}

function EdgePickCylinder({
  edge,
  from,
  to,
}: {
  edge: SceneEdge;
  from: [number, number, number];
  to: [number, number, number];
}) {
  const { onEdgeHoverStart, onEdgeHoverEnd, setPinnedEdge } = useProjection();

  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const mid = dir.clone().multiplyScalar(0.5).add(a);
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { position: mid, quaternion: q, length: len };
  }, [from, to]);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh
        renderOrder={1}
        onPointerOver={(e) => {
          e.stopPropagation();
          onEdgeHoverStart(edge.key);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onEdgeHoverEnd();
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          setPinnedEdge(edge);
        }}
      >
        <cylinderGeometry args={[PICK_RADIUS, PICK_RADIUS, Math.max(length, 0.001), 8]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function GraphEdgeLines({
  edges,
  posMap,
  activeSubgraphKeys,
  graphSearch,
  pinnedSubgraphHighlight,
}: {
  edges: SceneEdge[];
  posMap: Map<string, [number, number, number]>;
  /** When non-null, only edges with both endpoints in this set are fully lit. */
  activeSubgraphKeys: ReadonlySet<string> | null;
  graphSearch: GraphSearchState | null;
  /** When a node is clicked (pinned), keep its ego edges bright even if search would dim them. */
  pinnedSubgraphHighlight: boolean;
}) {
  const { pinnedEdge, selected } = useProjection();
  const pinnedSubgraphActive = selected !== null || pinnedEdge !== null;

  return (
    <>
      {edges.map((e) => {
        const from = posMap.get(e.fromKey);
        const to = posMap.get(e.toKey);
        if (!from || !to) return null;

        const searchLit =
          graphSearch === null ||
          pinnedSubgraphHighlight ||
          (graphSearch.relevantKeys.has(e.fromKey) && graphSearch.relevantKeys.has(e.toKey));
        const subgraphLit =
          activeSubgraphKeys === null ||
          (activeSubgraphKeys.has(e.fromKey) && activeSubgraphKeys.has(e.toKey));
        const lit = searchLit && subgraphLit;

        const opacity = lit ? 0.5 : 0.07;
        const inPinnedSubgraph =
          pinnedSubgraphActive &&
          activeSubgraphKeys !== null &&
          activeSubgraphKeys.has(e.fromKey) &&
          activeSubgraphKeys.has(e.toKey);
        const animateDash = inPinnedSubgraph && !!e.directed;

        return (
          <group key={e.key}>
            <GraphDashedEdgeLine from={from} to={to} opacity={opacity} animateDash={animateDash} />
            <EdgePickCylinder edge={e} from={from} to={to} />
          </group>
        );
      })}
    </>
  );
}

/** Edge midpoint labels when an ego subgraph is active (hover or pinned). */
export function ActiveSubgraphEdgeLabels({
  edges,
  posMap,
  activeSubgraphKeys,
}: {
  edges: SceneEdge[];
  posMap: Map<string, [number, number, number]>;
  activeSubgraphKeys: ReadonlySet<string> | null;
}) {
  if (!activeSubgraphKeys) return null;

  return (
    <>
      {edges.map((e) => {
        const from = posMap.get(e.fromKey);
        const to = posMap.get(e.toKey);
        if (!from || !to) return null;
        if (!activeSubgraphKeys.has(e.fromKey) || !activeSubgraphKeys.has(e.toKey)) return null;

        const text = e.labels.length > 0 ? e.labels.join(" · ") : `${e.fromKey} ↔ ${e.toKey}`;
        const mx = (from[0] + to[0]) / 2;
        const my = (from[1] + to[1]) / 2;
        const mz = (from[2] + to[2]) / 2;

        return (
          <group key={`lbl-${e.key}`} position={[mx, my, mz]}>
            <Html
              center
              distanceFactor={EDGE_LABEL_DISTANCE_FACTOR}
              style={{ pointerEvents: "none" }}
              zIndexRange={[200, 0]}
            >
              <span className="max-w-[12rem] rounded bg-background/90 px-1.5 py-0.5 text-center text-[10px] leading-tight text-foreground shadow-sm ring-1 ring-border/60">
                {text}
              </span>
            </Html>
          </group>
        );
      })}
    </>
  );
}
