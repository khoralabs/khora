import { Html, Line } from "@react-three/drei";
import type { GraphSearchState, SceneEdge } from "./projection-types.js";

const EDGE_LABEL_DISTANCE_FACTOR = 5;

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

        return (
          <Line
            key={e.key}
            points={[from, to]}
            color="black"
            lineWidth={1}
            transparent
            opacity={opacity}
            depthTest
            depthWrite={false}
            renderOrder={0}
          />
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
