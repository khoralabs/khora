import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import type { FrameChannelHubPort, FrameChannelPeer } from "./port";

export type AttachDuplexFrameChannelPeerResult = {
  peer: FrameChannelPeer;
  dispose(): Promise<void>;
};

/**
 * Attach a {@link DuplexByteStream} as a {@link FrameChannelPeer} on `channelId` (same semantics as WebSocket handlers).
 * Pump runs until {@link DuplexByteStream.close}; then the peer is detached automatically.
 */
export async function attachDuplexAsFrameChannelPeer(
  hub: FrameChannelHubPort,
  channelId: string,
  duplex: DuplexByteStream,
): Promise<AttachDuplexFrameChannelPeerResult> {
  const abort = new AbortController();
  let detached = false;
  const detachOnce = (): void => {
    if (detached) return;
    detached = true;
    hub.detachPeer(channelId, peer);
  };

  const peer: FrameChannelPeer = {
    send(bytes: Uint8Array) {
      void duplex.write(bytes).catch((err) => {
        console.error("[agent-relay] duplex frame-channel write failed", err);
      });
    },
  };

  await hub.attachPeer(channelId, peer);

  void (async () => {
    try {
      for await (const chunk of duplex.read()) {
        if (abort.signal.aborted) break;
        hub.relayBytes(channelId, peer, chunk);
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        console.error("[agent-relay] duplex frame-channel read pump failed", e);
      }
    } finally {
      detachOnce();
      abort.abort();
      await duplex.close().catch(() => {});
    }
  })();

  return {
    peer,
    dispose: async () => {
      abort.abort();
      await duplex.close().catch(() => {});
    },
  };
}
