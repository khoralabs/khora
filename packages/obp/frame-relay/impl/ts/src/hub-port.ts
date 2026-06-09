/** Live peer attached to a frame relay hub session; opaque bytes (reference identity for detach). */
export type FrameRelayPeer = {
  send(bytes: Uint8Array): void;
};

/** HMAC-ticket gated byte relay: create channel, verify ticket, attach/replay, relay opaque bytes. */
export interface FrameRelayHubPort {
  createChannel(channelId: string, ttlMs?: number): Promise<{ ticket: string }>;
  /** New ticket + secret for an existing channel without clearing buffered frames (rejoin). */
  rotateChannelTicket(channelId: string, ttlMs?: number): Promise<{ ticket: string }>;
  /** Sign a ticket with the current pairing secret without rotating (shared multiplex ticket). */
  mintChannelTicket(channelId: string): Promise<{ ticket: string } | undefined>;
  verifyTicket(channelId: string, ticket: string): Promise<boolean>;
  attachPeer(channelId: string, peer: FrameRelayPeer): Promise<void>;
  detachPeer(channelId: string, peer: FrameRelayPeer): void;
  relayBytes(channelId: string, from: FrameRelayPeer, bytes: Uint8Array): void;
}
