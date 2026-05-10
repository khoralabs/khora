/** Live peer in an OBP byte relay room; opaque framing (reference identity for detach). */
export type ObpRoomPeer = {
  send(bytes: Uint8Array): void;
};

/** HMAC-ticket gated byte relay: create room, verify ticket, attach/replay, relay opaque OBP bytes. */
export interface ObpRoomHubPort {
  createRoom(roomId: string, ttlMs?: number): Promise<{ ticket: string }>;
  verifyTicket(roomId: string, ticket: string): Promise<boolean>;
  attachPeer(roomId: string, peer: ObpRoomPeer): Promise<void>;
  detachPeer(roomId: string, peer: ObpRoomPeer): void;
  relayBytes(roomId: string, from: ObpRoomPeer, bytes: Uint8Array): void;
}
