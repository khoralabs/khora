import type { FrameRelayHubWsData } from "@khoralabs/obp-frame-relay";

/** WebSocket `data` attached after upgrade for khora Bun `Bun.serve` (inbox vs frame relay room). */
export type KhoraWsData = { kind: "inbox"; did: string } | FrameRelayHubWsData;

/** Minimal surface required to perform WebSocket upgrade for khora host routes. */
export type KhoraWsUpgradePort = {
  upgrade(request: Request, options: { data: KhoraWsData }): boolean;
};
