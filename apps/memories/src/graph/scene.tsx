import { Bounds, OrbitControls, useBounds } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { type ElementRef, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  ActiveSubgraphEdgeLabels,
  GraphEdgeLines,
  type GraphEdgeRenderMode,
} from "./edges.js";
import { GraphPinnedEscHint } from "./graph-pinned-esc-hint.js";
import { GraphPreviewDock } from "./graph-preview-dock.js";
import { Marker } from "./marker.js";
import { SCALE } from "./projection-types.js";
import { useProjection } from "./use-projection.js";

/** Axis-aligned center of all node positions in world space (matches graph extent). */
function useOrbitTarget(points: { x: number; y: number; z: number }[]): [number, number, number] {
  return useMemo(() => {
    if (points.length === 0) return [0, 0, 0];
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
      const x = p.x * SCALE;
      const y = p.y * SCALE;
      const z = p.z * SCALE;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
    return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  }, [points]);
}

/**
 * Drei `Bounds` runs its first `refresh()` in the same layout pass as the initial WebGL graph;
 * lines/markers often have no world AABB yet, so the fit targets the wrong center. A second
 * refit after two animation frames matches the behavior after a full remount (e.g. Reload).
 */
const BOUNDS_SNAP_MS = 520;

function DeferredGraphBoundsRefit({
  pointCount,
  orbitTarget,
}: {
  pointCount: number;
  orbitTarget: [number, number, number];
}) {
  const api = useBounds();
  const apiRef = useRef(api);
  apiRef.current = api;
  const controls = useThree((s) => s.controls);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  /**
   * Only refit when graph topology / layout center changes — not when hover or OrbitControls
   * identity updates. Otherwise Bounds + this effect re-run `fit()` and the camera zooms out.
   */
  useLayoutEffect(() => {
    if (pointCount === 0) return;
    let cancelled = false;
    const rafInnerRef = { id: 0 };
    const rafOuter = requestAnimationFrame(() => {
      rafInnerRef.id = requestAnimationFrame(() => {
        if (cancelled) return;
        apiRef.current.refresh();
        apiRef.current.reset().fit();
        apiRef.current.clip();
      });
    });
    const snapId = window.setTimeout(() => {
      if (cancelled) return;
      const oc = controlsRef.current as unknown as {
        target: { set: (x: number, y: number, z: number) => void };
        update: () => void;
      } | null;
      if (!oc) return;
      const [x, y, z] = orbitTarget;
      oc.target.set(x, y, z);
      oc.update();
    }, BOUNDS_SNAP_MS);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafOuter);
      if (rafInnerRef.id) cancelAnimationFrame(rafInnerRef.id);
      window.clearTimeout(snapId);
    };
  }, [pointCount, orbitTarget]);
  return null;
}

export type { GraphEdgeRenderMode };

function GraphSceneR3f({ edgeRenderMode }: { edgeRenderMode: GraphEdgeRenderMode }) {
  const {
    points,
    sceneEdges,
    setSelected,
    focusEntryId,
    activeSubgraphKeys,
    onHoverStart,
    onHoverEnd,
    clearHover,
    graphSearch,
  } = useProjection();

  const orbitTarget = useOrbitTarget(points);
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const onCameraNavStart = useCallback(() => {
    clearHover();
  }, [clearHover]);

  useLayoutEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const [x, y, z] = orbitTarget;
    ctrl.target.set(x, y, z);
    ctrl.update();
  }, [orbitTarget]);

  const posMap = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    for (const p of points) {
      m.set(p.entryId, [p.x * SCALE, p.y * SCALE, p.z * SCALE]);
    }
    return m;
  }, [points]);

  /** Mean position for tooltip “outward” rule: active subgraph if any, else full graph. */
  const tooltipCentroid = useMemo((): [number, number, number] => {
    const useSubgraph = activeSubgraphKeys !== null && activeSubgraphKeys.size > 0;
    const subset = useSubgraph ? points.filter((p) => activeSubgraphKeys.has(p.entryId)) : points;
    const basis = subset.length > 0 ? subset : points;
    if (basis.length === 0) return [0, 0, 0];
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const p of basis) {
      sx += p.x * SCALE;
      sy += p.y * SCALE;
      sz += p.z * SCALE;
    }
    const n = basis.length;
    return [sx / n, sy / n, sz / n];
  }, [points, activeSubgraphKeys]);

  return (
    <>
      <color attach="background" args={["var(--card)"]} />
      <ambientLight intensity={0.8} />
      <pointLight position={[8, 8, 8]} intensity={40} />
      <pointLight position={[-8, -8, -4]} intensity={12} color="#8ab4ff" />
      {/*
        `observe` must stay off: drei refits whenever `controls`/`size` deps change, which happens
        on hover/re-render and resets the camera. Refit only via DeferredGraphBoundsRefit + mount.
      */}
      <Bounds fit clip margin={2} maxDuration={0.45}>
        <DeferredGraphBoundsRefit pointCount={points.length} orbitTarget={orbitTarget} />
        <GraphEdgeLines
          edges={sceneEdges}
          posMap={posMap}
          activeSubgraphKeys={activeSubgraphKeys}
          graphSearch={graphSearch}
          edgeRenderMode={edgeRenderMode}
        />
        <ActiveSubgraphEdgeLabels
          edges={sceneEdges}
          posMap={posMap}
          activeSubgraphKeys={activeSubgraphKeys}
        />
        {points.map((point) => {
          const inActiveSubgraph = !!activeSubgraphKeys?.has(point.entryId);
          const searchDimmed =
            graphSearch !== null &&
            !graphSearch.relevantKeys.has(point.entryId) &&
            !inActiveSubgraph;
          const subgraphDimmed =
            activeSubgraphKeys !== null &&
            point.entryId !== focusEntryId &&
            !activeSubgraphKeys.has(point.entryId);
          const forceTooltipOpen = !!activeSubgraphKeys?.has(point.entryId);
          return (
            <Marker
              key={point.entryId}
              point={point}
              dimmed={searchDimmed || subgraphDimmed}
              forceTooltipOpen={forceTooltipOpen}
              tooltipCentroid={tooltipCentroid}
              onSelect={setSelected}
              onHoverStart={onHoverStart}
              onHoverEnd={onHoverEnd}
            />
          );
        })}
      </Bounds>
      <OrbitControls
        ref={controlsRef}
        target={orbitTarget}
        enableDamping
        makeDefault
        onStart={onCameraNavStart}
      />
    </>
  );
}

export function GraphScene({
  edgeRenderMode = "all",
}: {
  edgeRenderMode?: GraphEdgeRenderMode;
} = {}) {
  return (
    <>
      <GraphPinnedEscHint />
      <div className="r3f-layer relative h-full w-full">
        <GraphPreviewDock />
        <Canvas
          className="h-full w-full touch-none"
          camera={{ position: [0, 0, 4.8], fov: 20 }}
          dpr={[1, 2]}
          gl={{
            alpha: false,
            antialias: true,
            depth: true,
            stencil: false,
            powerPreference: "high-performance",
            preserveDrawingBuffer: false,
          }}
        >
          <GraphSceneR3f edgeRenderMode={edgeRenderMode} />
        </Canvas>
      </div>
    </>
  );
}
