/** Live peer attached to a frame-channel hub session; opaque bytes (reference identity for detach). */
export type FrameChannelPeer = {
  send(bytes: Uint8Array): void;
};

/** HMAC-ticket gated byte relay: create room, verify ticket, attach/replay, relay opaque bytes. */
export interface FrameChannelHubPort {
  createChannel(channelId: string, ttlMs?: number): Promise<{ ticket: string }>;
  /** New ticket + secret for an existing room without clearing buffered frames (rejoin). */
  rotateChannelTicket(channelId: string, ttlMs?: number): Promise<{ ticket: string }>;
  verifyTicket(channelId: string, ticket: string): Promise<boolean>;
  attachPeer(channelId: string, peer: FrameChannelPeer): Promise<void>;
  detachPeer(channelId: string, peer: FrameChannelPeer): void;
  relayBytes(channelId: string, from: FrameChannelPeer, bytes: Uint8Array): void;
}
