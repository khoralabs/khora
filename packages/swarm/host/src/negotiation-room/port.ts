/** Live peer in a negotiation byte-relay room; opaque framing (reference identity for detach). */
export type NegotiationRoomPeer = {
  send(bytes: Uint8Array): void;
};

/** HMAC-ticket gated byte relay: create room, verify ticket, attach/replay, relay opaque bytes. */
export interface NegotiationRoomHubPort {
  createRoom(roomId: string, ttlMs?: number): Promise<{ ticket: string }>;
  /** New ticket + secret for an existing room without clearing buffered frames (rejoin). */
  rotateRoomTicket(roomId: string, ttlMs?: number): Promise<{ ticket: string }>;
  verifyTicket(roomId: string, ticket: string): Promise<boolean>;
  attachPeer(roomId: string, peer: NegotiationRoomPeer): Promise<void>;
  detachPeer(roomId: string, peer: NegotiationRoomPeer): void;
  relayBytes(roomId: string, from: NegotiationRoomPeer, bytes: Uint8Array): void;
}
