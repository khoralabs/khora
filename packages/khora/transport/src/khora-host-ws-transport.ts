import type { AgentRelayFrameChannelWsData } from "@khoralabs/agent-relay";

/** WebSocket `data` attached after upgrade for khora Bun `Bun.serve` (inbox vs frame-channel room). */
export type KhoraWsData = { kind: "inbox"; did: string } | AgentRelayFrameChannelWsData;

/** Minimal surface required to perform WebSocket upgrade for khora host routes. */
export type KhoraWsUpgradePort = {
  upgrade(request: Request, options: { data: KhoraWsData }): boolean;
};
