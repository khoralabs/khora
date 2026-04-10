import { Billboard, OrbitControls, Text, useCursor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type GraphPayload = {
  namespace: string;
  nodes: Array<{ key: string; x: number; y: number; z: number; labels: string[] }>;
  edges: Array<{ fromKey: string; toKey: string; labels: string[] }>;
};

function positionsMap(data: GraphPayload): Map<string, [number, number, number]> {
  const pos = new Map<string, [number, number, number]>();
  for (const n of data.nodes) {
    pos.set(n.key, [n.x, n.y, n.z]);
  }
  return pos;
}

function EdgeSegments({ data }: { data: GraphPayload }) {
  const geometry = useMemo(() => {
    const pos = positionsMap(data);
    const verts: number[] = [];
    for (const e of data.edges) {
      const a = pos.get(e.fromKey);
      const b = pos.get(e.toKey);
      if (!a || !b) continue;
      verts.push(...a, ...b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    return g;
  }, [data]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#666666" transparent opacity={0.85} />
    </lineSegments>
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
function LabelText(props: ComponentProps<typeof Text>) {
  const ref = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (m) m.raycast = () => {};
  }, []);
  return <Text ref={ref} {...props} />;
}

function NodeLabels({ data }: { data: GraphPayload }) {
  return (
    <>
      {data.nodes.map((n) => {
        const raw = formatLabels(n.labels);
        if (!raw) return null;
        const text = ellipsize(raw, 80);
        return (
          <Billboard key={n.key} position={[n.x, n.y + 0.07, n.z]} follow>
            <LabelText
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
            </LabelText>
          </Billboard>
        );
      })}
    </>
  );
}

function EdgeLabels({ data }: { data: GraphPayload }) {
  const items = useMemo(() => {
    const pos = positionsMap(data);
    const out: Array<{
      id: string;
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
        id: `${e.fromKey}\0${e.toKey}\0${i}`,
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
        return (
          <Billboard key={item.id} position={item.mid} follow>
            <LabelText
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
            </LabelText>
          </Billboard>
        );
      })}
    </>
  );
}

function Scene({
  data,
  hoverKey,
  onNodeOver,
  onNodeOut,
}: {
  data: GraphPayload;
  hoverKey: string | null;
  onNodeOver: (key: string) => void;
  onNodeOut: () => void;
}) {
  useCursor(!!hoverKey);

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
      {positions.map(({ key, p }) => (
        <mesh
          key={key}
          position={p}
          onPointerOver={(e) => {
            e.stopPropagation();
            onNodeOver(key);
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            onNodeOut();
          }}
        >
          <sphereGeometry args={[0.04, 20, 20]} />
          <meshStandardMaterial
            color="#6ea8ff"
            emissive={hoverKey === key ? "#2244aa" : "#000000"}
            emissiveIntensity={hoverKey === key ? 0.45 : 0}
          />
        </mesh>
      ))}
      <EdgeSegments data={data} />
      <NodeLabels data={data} />
      <EdgeLabels data={data} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
    </>
  );
}

function SourcePreviewPanel({
  namespace,
  hoverKey,
  preview,
  loading,
  onMouseEnter,
  onMouseLeave,
}: {
  namespace: string;
  hoverKey: string | null;
  preview: string | null;
  loading: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  if (!hoverKey) return null;

  return (
    <section
      aria-label="Memory source preview"
      className="pointer-events-auto fixed bottom-4 right-4 z-30 flex max-h-[min(50vh,420px)] w-[min(28rem,calc(100vw-2rem))] flex-col rounded-lg border border-border/60 bg-background/95 p-3 text-left shadow-lg backdrop-blur-md"
      onPointerEnter={onMouseEnter}
      onPointerLeave={onMouseLeave}
    >
      <div className="mb-1 font-mono text-[10px] text-muted-foreground">
        {namespace} <span className="text-foreground">·</span>{" "}
        <span className="text-foreground">{hoverKey}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-foreground">
        {loading ? (
          <span className="text-muted-foreground">Loading…</span>
        ) : preview ? (
          <pre className="whitespace-pre-wrap break-words font-mono">{preview}</pre>
        ) : (
          <span className="text-muted-foreground">No text content for this memory.</span>
        )}
      </div>
    </section>
  );
}

export function GraphView({ data, namespace }: { data: GraphPayload; namespace: string }) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClearHover = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const scheduleClearHover = useCallback(() => {
    cancelClearHover();
    clearTimerRef.current = setTimeout(() => setHoverKey(null), 280);
  }, [cancelClearHover]);

  const onNodeOver = useCallback(
    (key: string) => {
      cancelClearHover();
      setHoverKey(key);
    },
    [cancelClearHover],
  );

  const onNodeOut = useCallback(() => {
    scheduleClearHover();
  }, [scheduleClearHover]);

  useEffect(() => {
    if (!hoverKey) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    const ac = new AbortController();
    setPreviewLoading(true);
    setPreview(null);
    void fetch(
      `/api/memory-preview?namespace=${encodeURIComponent(namespace)}&key=${encodeURIComponent(hoverKey)}`,
      { signal: ac.signal },
    )
      .then((res) => res.json() as Promise<{ preview?: string | null; error?: string }>)
      .then((json) => {
        if (!ac.signal.aborted) setPreview(json.preview ?? null);
      })
      .catch(() => {
        if (!ac.signal.aborted) setPreview(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setPreviewLoading(false);
      });
    return () => ac.abort();
  }, [hoverKey, namespace]);

  return (
    <div className="relative h-full w-full">
      <SourcePreviewPanel
        namespace={namespace}
        hoverKey={hoverKey}
        preview={preview}
        loading={previewLoading}
        onMouseEnter={cancelClearHover}
        onMouseLeave={() => setHoverKey(null)}
      />
      <Canvas
        className="absolute inset-0 block h-full w-full"
        camera={{ position: [2.2, 2.2, 2.2], fov: 50, near: 0.01, far: 100 }}
        dpr={[1, 2]}
      >
        <Scene data={data} hoverKey={hoverKey} onNodeOver={onNodeOver} onNodeOut={onNodeOut} />
      </Canvas>
    </div>
  );
}
