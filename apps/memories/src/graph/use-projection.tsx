import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  GraphPayload,
  GraphSearchState,
  ProjectionPoint,
  SceneEdge,
} from "./projection-types.js";

const HOVER_DEBOUNCE_MS = 120;
const HOVER_CLEAR_DELAY_MS = 280;

type HoverData = {
  neighbors: Array<{ id: string; score: number }>;
  communityMembers: string[];
};

type ProjectionValue = {
  namespace: string;
  /** Immediate hover target (memory key); use for preview fetch. */
  liveHoveredEntryId: string | null;

  points: ProjectionPoint[];
  sceneEdges: SceneEdge[];
  graphSearch: GraphSearchState | null;

  selected: ProjectionPoint | null;
  setSelected: (p: ProjectionPoint | null) => void;

  hoveredEntryId: string | null;
  /** Pinned selection wins over hover for subgraph highlight / edge labels / tooltips. */
  focusEntryId: string | null;
  /** 1-hop ego of {@link focusEntryId} when hovering or a node is pinned; null when idle. */
  activeSubgraphKeys: ReadonlySet<string> | null;

  onHoverStart: (entryId: string) => void;
  onHoverEnd: () => void;
  clearHover: () => void;
  clearPinnedSelection: () => void;
  onMemoryPreviewPointerEnter: () => void;
  onMemoryPreviewPointerLeave: () => void;
  hoverData: HoverData | undefined;
};

const ProjectionContext = createContext<ProjectionValue | null>(null);

function buildPoints(data: GraphPayload): ProjectionPoint[] {
  return data.nodes.map((n) => ({
    entryId: n.key,
    key: n.key,
    x: n.x,
    y: n.y,
    z: n.z,
    labels: n.labels,
  }));
}

function dedupeUndirectedEdges(edges: GraphPayload["edges"]): SceneEdge[] {
  const seen = new Map<string, { fromKey: string; toKey: string; labels: Set<string> }>();
  for (const e of edges) {
    const a = e.fromKey < e.toKey ? e.fromKey : e.toKey;
    const b = e.fromKey < e.toKey ? e.toKey : e.fromKey;
    const k = `${a}\0${b}`;
    const existing = seen.get(k);
    if (existing) {
      for (const lb of e.labels) existing.labels.add(lb);
      continue;
    }
    seen.set(k, { fromKey: a, toKey: b, labels: new Set(e.labels) });
  }
  return [...seen.entries()].map(([key, v]) => ({
    key,
    fromKey: v.fromKey,
    toKey: v.toKey,
    labels: [...v.labels],
  }));
}

function buildAdjacency(data: GraphPayload): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let sa = m.get(a);
    if (!sa) {
      sa = new Set();
      m.set(a, sa);
    }
    sa.add(b);
  };
  for (const e of data.edges) {
    link(e.fromKey, e.toKey);
    link(e.toKey, e.fromKey);
  }
  return m;
}

export function GraphProjectionProvider({
  children,
  data,
  graphSearch = null,
}: PropsWithChildren<{
  data: GraphPayload;
  graphSearch?: GraphSearchState | null;
}>) {
  const points = useMemo(() => buildPoints(data), [data]);
  const sceneEdges = useMemo(() => dedupeUndirectedEdges(data.edges), [data.edges]);
  const adjacency = useMemo(() => buildAdjacency(data), [data]);

  const [selected, setSelected] = useState<ProjectionPoint | null>(null);
  const [rawHoveredId, setRawHoveredId] = useState<string | null>(null);
  const [debouncedHoveredId, setDebouncedHoveredId] = useState<string | null>(null);
  const hoverClearTimerRef = useRef<number | null>(null);

  const cancelScheduledHoverClear = useCallback(() => {
    if (hoverClearTimerRef.current !== null) {
      window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedHoveredId(rawHoveredId), HOVER_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [rawHoveredId]);

  const onHoverStart = useCallback(
    (entryId: string) => {
      cancelScheduledHoverClear();
      setRawHoveredId(entryId);
    },
    [cancelScheduledHoverClear],
  );

  const onHoverEnd = useCallback(() => {
    cancelScheduledHoverClear();
    const id = window.setTimeout(() => {
      hoverClearTimerRef.current = null;
      setRawHoveredId(null);
    }, HOVER_CLEAR_DELAY_MS);
    hoverClearTimerRef.current = id;
  }, [cancelScheduledHoverClear]);

  const clearHover = useCallback(() => {
    cancelScheduledHoverClear();
    setRawHoveredId(null);
  }, [cancelScheduledHoverClear]);

  const clearPinnedSelection = useCallback(() => {
    setSelected(null);
  }, []);

  const onMemoryPreviewPointerEnter = useCallback(() => {
    cancelScheduledHoverClear();
  }, [cancelScheduledHoverClear]);

  const onMemoryPreviewPointerLeave = useCallback(() => {
    cancelScheduledHoverClear();
    setRawHoveredId(null);
  }, [cancelScheduledHoverClear]);

  useEffect(() => () => cancelScheduledHoverClear(), [cancelScheduledHoverClear]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearHover();
        clearPinnedSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearHover, clearPinnedSelection]);

  const hoverData = useMemo((): HoverData | undefined => {
    if (!debouncedHoveredId) return undefined;
    const nbrs = adjacency.get(debouncedHoveredId);
    if (!nbrs) return { neighbors: [], communityMembers: [debouncedHoveredId] };
    const neighbors = [...nbrs].map((id) => ({ id, score: 1 }));
    return {
      neighbors,
      communityMembers: [debouncedHoveredId, ...neighbors.map((n) => n.id)],
    };
  }, [adjacency, debouncedHoveredId]);

  const focusEntryId = selected?.entryId ?? debouncedHoveredId ?? null;

  const activeSubgraphKeys = useMemo((): ReadonlySet<string> | null => {
    if (selected) {
      const nbrs = adjacency.get(selected.entryId);
      if (!nbrs) return new Set([selected.entryId]);
      return new Set([selected.entryId, ...nbrs]);
    }
    if (hoverData?.communityMembers.length) {
      return new Set(hoverData.communityMembers);
    }
    return null;
  }, [selected, hoverData, adjacency]);

  const value = useMemo(
    (): ProjectionValue => ({
      namespace: data.namespace,
      liveHoveredEntryId: rawHoveredId,
      points,
      sceneEdges,
      graphSearch,
      selected,
      setSelected,
      hoveredEntryId: debouncedHoveredId,
      focusEntryId,
      activeSubgraphKeys,
      onHoverStart,
      onHoverEnd,
      clearHover,
      clearPinnedSelection,
      onMemoryPreviewPointerEnter,
      onMemoryPreviewPointerLeave,
      hoverData,
    }),
    [
      data.namespace,
      rawHoveredId,
      points,
      sceneEdges,
      graphSearch,
      selected,
      debouncedHoveredId,
      focusEntryId,
      activeSubgraphKeys,
      onHoverStart,
      onHoverEnd,
      clearHover,
      clearPinnedSelection,
      onMemoryPreviewPointerEnter,
      onMemoryPreviewPointerLeave,
      hoverData,
    ],
  );

  return <ProjectionContext.Provider value={value}>{children}</ProjectionContext.Provider>;
}

export function useProjection(): ProjectionValue {
  const ctx = useContext(ProjectionContext);
  if (!ctx) throw new Error("useProjection must be used within GraphProjectionProvider");
  return ctx;
}
