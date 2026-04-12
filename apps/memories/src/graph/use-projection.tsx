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
  /** Immediate hover target (undirected edge key); use for edge preview fetch. */
  liveHoveredEdgeKey: string | null;

  points: ProjectionPoint[];
  sceneEdges: SceneEdge[];
  graphSearch: GraphSearchState | null;

  selected: ProjectionPoint | null;
  setSelected: (p: ProjectionPoint | null) => void;

  pinnedEdge: SceneEdge | null;
  setPinnedEdge: (e: SceneEdge | null) => void;

  hoveredEntryId: string | null;
  /** Center node for subgraph dimming: click pin, else null when search drives the subgraph, else hover. */
  focusEntryId: string | null;
  /** 1-hop ego of click pin, search hits, or hover — priority: click > search > hover. */
  activeSubgraphKeys: ReadonlySet<string> | null;
  /**
   * Subgraph edge chrome: pin, search hits, or live pointer on node/edge — drives `activeOnly` edge
   * visibility and lit subgraph (same path as hover/pin).
   */
  hasGraphSubgraphFocus: boolean;
  /** Pin or search hits — directed-edge dash emphasis; excludes hover-only (matches previous pin rule). */
  hasGraphSubgraphStrongFocus: boolean;

  onHoverStart: (entryId: string) => void;
  onHoverEnd: () => void;
  onEdgeHoverStart: (edgeKey: string) => void;
  onEdgeHoverEnd: () => void;
  clearHover: () => void;
  clearPinnedSelection: () => void;
  /** Clears hover, click pin, and search field/results (parent `onDismissPersistentFocus`). */
  dismissPersistentGraphFocus: () => void;
  onMemoryPreviewPointerEnter: () => void;
  onMemoryPreviewPointerLeave: () => void;
  hoverData: HoverData | undefined;

  /**
   * Bottom-right preview card: same rules for hover vs pin — live pointer target wins, else the
   * locked pin (edge pin before node pin when deciding fallback order). Edge hover beats node hover.
   */
  graphPreview:
    | { kind: "node"; point: ProjectionPoint }
    | { kind: "edge"; edge: SceneEdge }
    | null;
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

function buildSceneEdges(edges: GraphPayload["edges"]): SceneEdge[] {
  const seen = new Map<
    string,
    { fromKey: string; toKey: string; labels: Set<string>; edgeId: string }
  >();
  const directed: SceneEdge[] = [];
  for (const e of edges) {
    if (e.directed) {
      directed.push({
        key: `${e.fromKey}\0${e.toKey}\0dir\0${e.edgeId}`,
        edgeId: e.edgeId,
        fromKey: e.fromKey,
        toKey: e.toKey,
        labels: [...new Set(e.labels)],
        directed: true,
      });
      continue;
    }
    const a = e.fromKey < e.toKey ? e.fromKey : e.toKey;
    const b = e.fromKey < e.toKey ? e.toKey : e.fromKey;
    const k = `${a}\0${b}`;
    const existing = seen.get(k);
    if (existing) {
      for (const lb of e.labels) existing.labels.add(lb);
      continue;
    }
    seen.set(k, { fromKey: a, toKey: b, labels: new Set(e.labels), edgeId: e.edgeId });
  }
  const undirected = [...seen.entries()].map(([key, v]) => ({
    key,
    edgeId: v.edgeId,
    fromKey: v.fromKey,
    toKey: v.toKey,
    labels: [...v.labels],
  }));
  return [...directed, ...undirected];
}

function expandEgoKeys(
  keys: ReadonlySet<string>,
  adjacency: Map<string, Set<string>>,
): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    out.add(k);
    const nbrs = adjacency.get(k);
    if (nbrs) for (const n of nbrs) out.add(n);
  }
  return out;
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
  searchQuery = "",
  onDismissPersistentFocus,
}: PropsWithChildren<{
  data: GraphPayload;
  graphSearch?: GraphSearchState | null;
  /** Kept in sync with the search field so click-pin clears while typing or when results update. */
  searchQuery?: string;
  /** Clears the search field / results in the parent (e.g. `setSearchQuery("")`). */
  onDismissPersistentFocus?: () => void;
}>) {
  const points = useMemo(() => buildPoints(data), [data]);
  const sceneEdges = useMemo(() => buildSceneEdges(data.edges), [data.edges]);
  const adjacency = useMemo(() => buildAdjacency(data), [data]);

  const [selected, setSelectedInternal] = useState<ProjectionPoint | null>(null);
  const [pinnedEdge, setPinnedEdgeInternal] = useState<SceneEdge | null>(null);
  const [rawHoveredId, setRawHoveredId] = useState<string | null>(null);
  const [debouncedHoveredId, setDebouncedHoveredId] = useState<string | null>(null);
  const [rawHoveredEdgeKey, setRawHoveredEdgeKey] = useState<string | null>(null);
  const [debouncedHoveredEdgeKey, setDebouncedHoveredEdgeKey] = useState<string | null>(null);
  const hoverClearTimerRef = useRef<number | null>(null);
  const edgeHoverClearTimerRef = useRef<number | null>(null);

  const cancelScheduledHoverClear = useCallback(() => {
    if (hoverClearTimerRef.current !== null) {
      window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
  }, []);

  const cancelScheduledEdgeHoverClear = useCallback(() => {
    if (edgeHoverClearTimerRef.current !== null) {
      window.clearTimeout(edgeHoverClearTimerRef.current);
      edgeHoverClearTimerRef.current = null;
    }
  }, []);

  const cancelAllHoverTimers = useCallback(() => {
    cancelScheduledHoverClear();
    cancelScheduledEdgeHoverClear();
  }, [cancelScheduledHoverClear, cancelScheduledEdgeHoverClear]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedHoveredId(rawHoveredId), HOVER_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [rawHoveredId]);

  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedHoveredEdgeKey(rawHoveredEdgeKey),
      HOVER_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [rawHoveredEdgeKey]);

  const setSelected = useCallback((p: ProjectionPoint | null) => {
    setPinnedEdgeInternal(null);
    setSelectedInternal(p);
  }, []);

  const setPinnedEdge = useCallback((e: SceneEdge | null) => {
    setSelectedInternal(null);
    setPinnedEdgeInternal(e);
  }, []);

  const onHoverStart = useCallback(
    (entryId: string) => {
      cancelAllHoverTimers();
      setRawHoveredEdgeKey(null);
      setRawHoveredId(entryId);
    },
    [cancelAllHoverTimers],
  );

  const onHoverEnd = useCallback(() => {
    cancelScheduledHoverClear();
    const id = window.setTimeout(() => {
      hoverClearTimerRef.current = null;
      setRawHoveredId(null);
    }, HOVER_CLEAR_DELAY_MS);
    hoverClearTimerRef.current = id;
  }, [cancelScheduledHoverClear]);

  const onEdgeHoverStart = useCallback(
    (edgeKey: string) => {
      cancelAllHoverTimers();
      setRawHoveredId(null);
      setRawHoveredEdgeKey(edgeKey);
    },
    [cancelAllHoverTimers],
  );

  const onEdgeHoverEnd = useCallback(() => {
    cancelScheduledEdgeHoverClear();
    const id = window.setTimeout(() => {
      edgeHoverClearTimerRef.current = null;
      setRawHoveredEdgeKey(null);
    }, HOVER_CLEAR_DELAY_MS);
    edgeHoverClearTimerRef.current = id;
  }, [cancelScheduledEdgeHoverClear]);

  const clearHover = useCallback(() => {
    cancelAllHoverTimers();
    setRawHoveredId(null);
    setRawHoveredEdgeKey(null);
  }, [cancelAllHoverTimers]);

  const clearPinnedSelection = useCallback(() => {
    setSelectedInternal(null);
    setPinnedEdgeInternal(null);
  }, []);

  const dismissPersistentGraphFocus = useCallback(() => {
    clearHover();
    clearPinnedSelection();
    onDismissPersistentFocus?.();
  }, [clearHover, clearPinnedSelection, onDismissPersistentFocus]);

  const onMemoryPreviewPointerEnter = useCallback(() => {
    cancelAllHoverTimers();
  }, [cancelAllHoverTimers]);

  const onMemoryPreviewPointerLeave = useCallback(() => {
    cancelAllHoverTimers();
    setRawHoveredId(null);
    setRawHoveredEdgeKey(null);
  }, [cancelAllHoverTimers]);

  useEffect(
    () => () => {
      cancelAllHoverTimers();
    },
    [cancelAllHoverTimers],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissPersistentGraphFocus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dismissPersistentGraphFocus]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: clear click-pin when search text or fetched results change
  useEffect(() => {
    setSelectedInternal(null);
    setPinnedEdgeInternal(null);
  }, [searchQuery, graphSearch]);

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

  const hoveredEdgeSubgraphKeys = useMemo((): ReadonlySet<string> | null => {
    if (!debouncedHoveredEdgeKey) return null;
    const edge = sceneEdges.find((e) => e.key === debouncedHoveredEdgeKey);
    if (!edge) return null;
    return new Set([edge.fromKey, edge.toKey]);
  }, [debouncedHoveredEdgeKey, sceneEdges]);

  const searchSubgraphKeys = useMemo((): ReadonlySet<string> | null => {
    if (!graphSearch || graphSearch.relevantKeys.size === 0) return null;
    return expandEgoKeys(graphSearch.relevantKeys, adjacency);
  }, [graphSearch, adjacency]);

  const focusEntryId =
    selected?.entryId ?? (searchSubgraphKeys ? null : (debouncedHoveredId ?? null));

  const activeSubgraphKeys = useMemo((): ReadonlySet<string> | null => {
    if (selected) {
      const nbrs = adjacency.get(selected.entryId);
      if (!nbrs) return new Set([selected.entryId]);
      return new Set([selected.entryId, ...nbrs]);
    }
    if (pinnedEdge) {
      return new Set([pinnedEdge.fromKey, pinnedEdge.toKey]);
    }
    if (searchSubgraphKeys) return searchSubgraphKeys;
    if (hoveredEdgeSubgraphKeys) return hoveredEdgeSubgraphKeys;
    if (hoverData?.communityMembers.length) {
      return new Set(hoverData.communityMembers);
    }
    return null;
  }, [selected, pinnedEdge, searchSubgraphKeys, hoveredEdgeSubgraphKeys, hoverData, adjacency]);

  const searchDrivesSubgraph =
    graphSearch !== null && graphSearch.relevantKeys.size > 0;

  const hasGraphSubgraphStrongFocus =
    selected !== null || pinnedEdge !== null || searchDrivesSubgraph;

  const hasGraphSubgraphFocus =
    hasGraphSubgraphStrongFocus ||
    rawHoveredId !== null ||
    rawHoveredEdgeKey !== null;

  const graphPreview = useMemo((): ProjectionValue["graphPreview"] => {
    if (rawHoveredEdgeKey) {
      const edge = sceneEdges.find((e) => e.key === rawHoveredEdgeKey);
      return edge ? { kind: "edge", edge } : null;
    }
    if (rawHoveredId) {
      const point = points.find((p) => p.entryId === rawHoveredId);
      return point ? { kind: "node", point } : null;
    }
    if (pinnedEdge) return { kind: "edge", edge: pinnedEdge };
    if (selected) return { kind: "node", point: selected };
    return null;
  }, [rawHoveredEdgeKey, rawHoveredId, pinnedEdge, selected, sceneEdges, points]);

  const value = useMemo(
    (): ProjectionValue => ({
      namespace: data.namespace,
      liveHoveredEntryId: rawHoveredId,
      liveHoveredEdgeKey: rawHoveredEdgeKey,
      points,
      sceneEdges,
      graphSearch,
      selected,
      setSelected,
      pinnedEdge,
      setPinnedEdge,
      hoveredEntryId: debouncedHoveredId,
      focusEntryId,
      activeSubgraphKeys,
      hasGraphSubgraphFocus,
      hasGraphSubgraphStrongFocus,
      onHoverStart,
      onHoverEnd,
      onEdgeHoverStart,
      onEdgeHoverEnd,
      clearHover,
      clearPinnedSelection,
      dismissPersistentGraphFocus,
      onMemoryPreviewPointerEnter,
      onMemoryPreviewPointerLeave,
      hoverData,
      graphPreview,
    }),
    [
      data.namespace,
      rawHoveredId,
      rawHoveredEdgeKey,
      points,
      sceneEdges,
      graphSearch,
      selected,
      setSelected,
      pinnedEdge,
      setPinnedEdge,
      debouncedHoveredId,
      focusEntryId,
      activeSubgraphKeys,
      hasGraphSubgraphFocus,
      hasGraphSubgraphStrongFocus,
      onHoverStart,
      onHoverEnd,
      onEdgeHoverStart,
      onEdgeHoverEnd,
      clearHover,
      clearPinnedSelection,
      dismissPersistentGraphFocus,
      onMemoryPreviewPointerEnter,
      onMemoryPreviewPointerLeave,
      hoverData,
      graphPreview,
    ],
  );

  return <ProjectionContext.Provider value={value}>{children}</ProjectionContext.Provider>;
}

export function useProjection(): ProjectionValue {
  const ctx = useContext(ProjectionContext);
  if (!ctx) throw new Error("useProjection must be used within GraphProjectionProvider");
  return ctx;
}
