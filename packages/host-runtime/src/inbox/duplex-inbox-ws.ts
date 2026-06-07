import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import type { InboxFanoutPort, InboxWebSocket } from "./inbox-fanout-port";

/** Adapt UTF-8 inbox JSON (`send(string)` like Bun {@link WebSocket}) to binary duplex writes. */
export function inboxWebSocketFromDuplexUtf8(duplex: DuplexByteStream): InboxWebSocket {
  const enc = new TextEncoder();
  return {
    send(data: string): number {
      const u = enc.encode(data);
      void duplex.write(u).catch((err: unknown) => {
        console.error("[host-runtime] duplex inbox write failed", err);
      });
      return u.byteLength;
    },
  };
}

async function discardInboundPump(duplex: DuplexByteStream): Promise<void> {
  try {
    for await (const _ of duplex.read()) {
      /* client→server inbox traffic undefined; drain for backpressure */
    }
  } catch {
    /* ignore */
  }
}

export type RunInboxDuplexAttachmentResult = {
  inboxWs: InboxWebSocket;
  dispose(): Promise<void>;
};

/** Register duplex-driven inbox socket on hub and drain inbound until duplex closes. */
export async function runInboxDuplexAttachment(opts: {
  inboxHub: InboxFanoutPort;
  did: string;
  duplex: DuplexByteStream;
}): Promise<RunInboxDuplexAttachmentResult> {
  const inboxWs = inboxWebSocketFromDuplexUtf8(opts.duplex);
  opts.inboxHub.add(opts.did, inboxWs);

  void discardInboundPump(opts.duplex).finally(() => {
    opts.inboxHub.remove(opts.did, inboxWs);
  });

  return {
    inboxWs,
    dispose: async () => {
      await opts.duplex.close().catch(() => {});
    },
  };
}
