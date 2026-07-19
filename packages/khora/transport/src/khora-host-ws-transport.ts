/** WebSocket `data` attached after upgrade for khora Bun `Bun.serve` (inbox multiplex). */
export type KhoraWsData = {
  kind: "inbox";
  connectionId: string;
  boundDids: Set<string>;
};

/** Minimal surface required to perform WebSocket upgrade for khora host routes. */
export type KhoraWsUpgradePort = {
  upgrade(request: Request, options: { data: KhoraWsData }): boolean;
};
