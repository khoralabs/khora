import { NbcChainBackground, NbcChainControls, NbcChainSelectionPanel } from "./chrome.tsx";
import {
  NbcChainEdgeDetails,
  NbcChainEmptySelectionHint,
  NbcChainNodeDetails,
} from "./details.tsx";
import { NbcChainOfferNode, NbcChainPortNode, nbcChainDefaultNodeTypes } from "./nodes.tsx";
import type { NbcChainProviderProps } from "./provider.tsx";
import { NbcChainProvider } from "./provider.tsx";
import { NbcChainScene } from "./scene.tsx";

export type NbcChainDefaultLayoutProps = Omit<NbcChainProviderProps, "children">;

export function NbcChainDefaultLayout(props: NbcChainDefaultLayoutProps) {
  return (
    <NbcChainProvider {...props}>
      <NbcChainScene>
        <NbcChainBackground />
        <NbcChainControls />
        <NbcChainSelectionPanel />
      </NbcChainScene>
    </NbcChainProvider>
  );
}

/** Compound components for visualizing an {@link NbcChainGraph} with React Flow. */
export const NbcChain = {
  Provider: NbcChainProvider,
  Scene: NbcChainScene,
  Background: NbcChainBackground,
  Controls: NbcChainControls,
  SelectionPanel: NbcChainSelectionPanel,
  NodeDetails: NbcChainNodeDetails,
  EdgeDetails: NbcChainEdgeDetails,
  EmptySelectionHint: NbcChainEmptySelectionHint,
  DefaultLayout: NbcChainDefaultLayout,
  OfferNode: NbcChainOfferNode,
  PortNode: NbcChainPortNode,
  defaultNodeTypes: nbcChainDefaultNodeTypes,
} as const;
