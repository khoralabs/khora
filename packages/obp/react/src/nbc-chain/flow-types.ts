/** How the viewport frames the graph after updates when nothing is selected and automation is active. */
export type NbcChainAfterBindViewport = "focus" | "encapsulate";

export type NbcChainFlowSelection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;
