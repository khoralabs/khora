import { Html } from "@react-three/drei";
import { DotIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type ProjectionPoint, SCALE } from "./projection-types.js";

/** Screen-space scale vs distance; pairs with camera FOV / zoom (see drei `Html`). */
const MARKER_DISTANCE_FACTOR = 5;

export function Marker({
  point,
  dimmed,
  forceTooltipOpen,
  onSelect,
  onHoverStart,
  onHoverEnd,
}: {
  point: ProjectionPoint;
  dimmed: boolean;
  /** When true, tooltip stays open for nodes in the active ego subgraph (hover or pinned). */
  forceTooltipOpen: boolean;
  onSelect: (point: ProjectionPoint) => void;
  onHoverStart: (entryId: string) => void;
  onHoverEnd: () => void;
}) {
  const tooltipLines = point.labels.length > 0 ? point.labels : [point.key];
  const [userTooltipOpen, setUserTooltipOpen] = useState(false);
  const tooltipOpen = forceTooltipOpen || userTooltipOpen;

  return (
    <group position={[point.x * SCALE, point.y * SCALE, point.z * SCALE]}>
      {/*
        Html root passes events through to the canvas (orbit/zoom). Only the inner control
        uses pointer-events:auto so empty space around the dot does not eat drags/wheel.
      */}
      <Html
        center
        distanceFactor={MARKER_DISTANCE_FACTOR}
        zIndexRange={[100, 2000]}
        className="r3f-html-marker-root"
        style={{ pointerEvents: "none" }}
      >
        <div className="w-fit" style={{ pointerEvents: "auto" }}>
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
              <TooltipContent side="right" className="max-w-xs">
                <span className="block whitespace-pre-line text-left text-xs">
                  {tooltipLines.join(" • ")}
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </Html>
    </group>
  );
}
