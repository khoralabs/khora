import type { Edge, Node } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { NbcChainAfterBindViewport, NbcChainFlowSelection } from "./flow-types.ts";

/** Browser scheduling; typed via `globalThis` so checking works without `lib: ["DOM"]`. */
const browserFrame = globalThis as typeof globalThis & {
  requestAnimationFrame: (callback: () => void) => number;
  cancelAnimationFrame: (handle: number) => void;
};

export function NbcChainViewportFitEffect({
  nodes,
  edges,
  selection,
  focusSceneKey,
  afterBindViewport,
  userAdjustedViewportRef,
}: {
  nodes: Node[];
  edges: Edge[];
  selection: NbcChainFlowSelection;
  focusSceneKey: string;
  afterBindViewport: NbcChainAfterBindViewport;
  userAdjustedViewportRef: RefObject<boolean>;
}) {
  const { fitView } = useReactFlow();
  const lastSelectionFitRef = useRef("");

  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }
    const selectionFitKey = selection === null ? "" : `${selection.kind}:${selection.id}`;

    let cancelled = false;
    const id = browserFrame.requestAnimationFrame(() => {
      browserFrame.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        if (selection?.kind === "edge") {
          if (lastSelectionFitRef.current === selectionFitKey) {
            return;
          }
          const edge = edges.find((e) => e.id === selection.id);
          if (edge !== undefined) {
            const src = nodes.find((n) => n.id === edge.source);
            const tgt = nodes.find((n) => n.id === edge.target);
            const subset = [src, tgt].filter((x): x is Node => x !== undefined);
            if (subset.length > 0) {
              fitView({
                nodes: subset,
                padding: 0.34,
                duration: 260,
                maxZoom: 2,
              });
              lastSelectionFitRef.current = selectionFitKey;
            }
          }
          return;
        }
        if (selection?.kind === "node") {
          if (lastSelectionFitRef.current === selectionFitKey) {
            return;
          }
          const picked = nodes.find((n) => n.id === selection.id);
          if (picked !== undefined) {
            fitView({
              nodes: [picked],
              padding: 0.36,
              duration: 260,
              maxZoom: 2,
            });
            lastSelectionFitRef.current = selectionFitKey;
          }
          return;
        }

        lastSelectionFitRef.current = "";

        if (userAdjustedViewportRef.current) {
          return;
        }

        if (afterBindViewport === "encapsulate") {
          fitView({ padding: 0.15, duration: 200 });
          return;
        }

        const want =
          focusSceneKey === ""
            ? []
            : focusSceneKey.split("\u001e").filter((fid) => nodes.some((n) => n.id === fid));
        if (want.length > 0) {
          const subset = nodes.filter((n) => want.includes(n.id));
          fitView({ nodes: subset, padding: 0.28, duration: 280, maxZoom: 1.75 });
        } else {
          fitView({ padding: 0.15, duration: 200 });
        }
      });
    });
    return () => {
      cancelled = true;
      browserFrame.cancelAnimationFrame(id);
    };
  }, [nodes, edges, fitView, focusSceneKey, selection, afterBindViewport, userAdjustedViewportRef]);

  return null;
}
