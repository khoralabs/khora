import { EdgePreviewCard } from "./edge-billboard.js";
import { NodePreviewCard } from "./node-billboard.js";
import { useProjection } from "./use-projection.js";

/**
 * Fixed bottom-right preview cards (node memory + edge detail) scoped to the graph viewport.
 * Preview target: live hover over node/edge, else the pinned edge or pinned node — same precedence
 * whether the subgraph is locked or hover-driven.
 */
export function GraphPreviewDock() {
  const { graphPreview } = useProjection();

  if (!graphPreview) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-end justify-end p-4"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-[min(28rem,calc(100vw-2rem))]">
        {graphPreview.kind === "edge" ? (
          <EdgePreviewCard edge={graphPreview.edge} open />
        ) : (
          <NodePreviewCard point={graphPreview.point} open />
        )}
      </div>
    </div>
  );
}
