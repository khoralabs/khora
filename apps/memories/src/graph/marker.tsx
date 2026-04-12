import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { DotIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type ProjectionPoint, SCALE } from "./projection-types.js";

/** Screen-space scale vs distance; pairs with camera FOV / zoom (see drei `Html`). */
const MARKER_DISTANCE_FACTOR = 5;

const _nodeNdc = new THREE.Vector3();
const _centroidNdc = new THREE.Vector3();

export function Marker({
  point,
  dimmed,
  forceTooltipOpen,
  tooltipCentroid,
  onSelect,
  onHoverStart,
  onHoverEnd,
}: {
  point: ProjectionPoint;
  dimmed: boolean;
  /** When true, tooltip stays open for nodes in the active ego subgraph (hover, pin, or search). */
  forceTooltipOpen: boolean;
  /** Mean position (scaled world space) for outward tooltip side: subgraph or full graph. */
  tooltipCentroid: readonly [number, number, number];
  onSelect: (point: ProjectionPoint) => void;
  onHoverStart: (entryId: string) => void;
  onHoverEnd: () => void;
}) {
  const tooltipText = (point.labels.length > 0 ? point.labels : [point.key]).join(" • ");
  const [userTooltipOpen, setUserTooltipOpen] = useState(false);
  const [tooltipSide, setTooltipSide] = useState<"left" | "right">("right");
  const tooltipOpen = forceTooltipOpen || userTooltipOpen;
  const sideRef = useRef<"left" | "right">("right");
  /** Portal tooltips here so they share the drei Html stacking layer (not `document.body`). */
  const [tooltipPortalEl, setTooltipPortalEl] = useState<HTMLDivElement | null>(null);
  const tooltipLayerRef = useCallback((el: HTMLDivElement | null) => {
    setTooltipPortalEl(el);
  }, []);
  const { camera } = useThree();

  useFrame(() => {
    _nodeNdc.set(point.x * SCALE, point.y * SCALE, point.z * SCALE);
    _centroidNdc.set(tooltipCentroid[0], tooltipCentroid[1], tooltipCentroid[2]);
    _nodeNdc.project(camera);
    _centroidNdc.project(camera);
    const dx = _nodeNdc.x - _centroidNdc.x;
    const next = dx >= 0 ? "right" : "left";
    if (sideRef.current !== next) {
      sideRef.current = next;
      setTooltipSide(next);
    }
  });

  return (
    <group position={[point.x * SCALE, point.y * SCALE, point.z * SCALE]}>
      {/*
        Html root passes events through to the canvas (orbit/zoom). Only the inner control
        uses pointer-events:auto so empty space around the dot does not eat drags/wheel.
      */}
      <Html
        center
        distanceFactor={MARKER_DISTANCE_FACTOR}
        className="r3f-html-marker-root"
        style={{ pointerEvents: "none" }}
      >
        <div ref={tooltipLayerRef} className="relative w-fit" style={{ pointerEvents: "auto" }}>
          <TooltipProvider>
            <Tooltip
              open={tooltipOpen}
              onOpenChange={(open) => {
                if (forceTooltipOpen) {
                  setUserTooltipOpen(false);
                  return;
                }
                setUserTooltipOpen(open);
              }}
            >
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="rounded-full border border-black"
                  style={{
                    opacity: dimmed ? 0.15 : 1,
                    pointerEvents: "auto",
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    onSelect(point);
                  }}
                  onPointerEnter={() => onHoverStart(point.entryId)}
                  onPointerLeave={() => onHoverEnd()}
                >
                  <DotIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                key={tooltipSide}
                container={tooltipPortalEl}
                side={tooltipSide}
                className="max-w-xs opacity-50"
              >
                <span className="block whitespace-pre-line text-left text-xs">{tooltipText}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </Html>
    </group>
  );
}
