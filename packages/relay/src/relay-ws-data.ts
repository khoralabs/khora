/** Passed to `server.upgrade(req, { data })` for relay WebSockets. */
export type RelayWsData =
  | { kind: "intent"; topics: string[]; actorHex: string }
  | { kind: "room"; sessionId: string };
