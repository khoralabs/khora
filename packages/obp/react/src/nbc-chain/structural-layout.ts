import type { CSSProperties } from "react";

/**
 * Merged onto the inner canvas shell so React Flow can fill the host.
 * Override via {@link NbcChainProviderProps.canvasShellProps}.
 */
export const NBC_CHAIN_CANVAS_SHELL_LAYOUT: CSSProperties = {
  position: "absolute",
  inset: 0,
};

/**
 * Merged onto the React Flow root so it fills the shell.
 * Override via {@link NbcChainSceneProps}`style`.
 */
export const NBC_CHAIN_SCENE_FLOW_LAYOUT: CSSProperties = {
  width: "100%",
  height: "100%",
};
