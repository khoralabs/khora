import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import type { FrameRelayHubPort, FrameRelayPeer } from "./hub-port";

export type AttachDuplexFrameRelayPeerResult = {
  peer: FrameRelayPeer;
  dispose(): Promise<void>;
};

/**
 * Attach a {@link DuplexByteStream} as a {@link FrameRelayPeer} on `channelId` (same semantics as WebSocket handlers).
 * Pump runs until {@link DuplexByteStream.close}; then the peer is detached automatically.
 */
export async function attachDuplexAsFrameRelayPeer(
  hub: FrameRelayHubPort,
  channelId: string,
  duplex: DuplexByteStream,
): Promise<AttachDuplexFrameRelayPeerResult> {
  const abort = new AbortController();
  let detached = false;
  const detachOnce = (): void => {
    if (detached) return;
    detached = true;
    hub.detachPeer(channelId, peer);
  };

  const peer: FrameRelayPeer = {
    send(bytes: Uint8Array) {
      void duplex.write(bytes).catch((err: unknown) => {
        console.error("[obp-frame-relay] duplex write failed", err);
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
        console.error("[obp-frame-relay] duplex read pump failed", e);
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
