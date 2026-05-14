import { Background, Controls, Panel } from "@xyflow/react";
import type { ComponentProps } from "react";
import { useNbcChain } from "./context.tsx";
import {
  NbcChainEdgeDetails,
  NbcChainEmptySelectionHint,
  NbcChainNodeDetails,
} from "./details.tsx";

export type NbcChainBackgroundProps = ComponentProps<typeof Background>;

export function NbcChainBackground(props: NbcChainBackgroundProps) {
  return <Background {...props} />;
}

export type NbcChainControlsProps = ComponentProps<typeof Controls>;

export function NbcChainControls(props: NbcChainControlsProps) {
  return <Controls {...props} />;
}

export type NbcChainSelectionPanelProps = ComponentProps<typeof Panel>;

export function NbcChainSelectionPanel({
  position = "top-right",
  ...rest
}: NbcChainSelectionPanelProps) {
  const { selectedEdge, selectedNode, graph } = useNbcChain();
  return (
    <Panel data-slot="nbc-chain-selection-panel" position={position} {...rest}>
      {selectedEdge !== undefined ? (
        <NbcChainEdgeDetails edge={selectedEdge} />
      ) : selectedNode !== undefined ? (
        <NbcChainNodeDetails node={selectedNode} graph={graph} />
      ) : (
        <NbcChainEmptySelectionHint />
      )}
    </Panel>
  );
}
